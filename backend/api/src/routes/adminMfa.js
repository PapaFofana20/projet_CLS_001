/**
 * MFA/TOTP pour la console d'administration Classora.
 *
 * Flux :
 *   1. GET    /admin/mfa/status        — état MFA de l'agent connecté.
 *   2. POST   /admin/mfa/setup         — génère un secret TOTP, le stocke
 *                                        (non activé tant que non vérifié),
 *                                        retourne l'URI otpauth.
 *   3. POST   /admin/mfa/verify-setup  — vérifie le premier code, active le MFA.
 *   4. POST   /admin/mfa/verify        — 2ème facteur après mot de passe
 *                                        (pré-authentification via preAuthToken).
 *   5. POST   /admin/mfa/disable       — désactive le MFA (code TOTP requis).
 *
 * Toutes les routes exigent un agent admin authentifié et ACTIF, sauf
 * /admin/mfa/verify qui accepte un preAuthToken émis par /admin/login.
 */

import {
  requireAdminRole,
  auditAdmin,
  serviceClient,
} from "../lib/authAdmin.js";
import { generateTOTPSecret, buildOTPAuthURI, verifyTOTPCode } from "../lib/totp.js";
import { createPreAuthSession, consumePreAuthSession, peekPreAuthSession } from "../lib/mfa-sessions.js";
import { encryptTOTPSecret, decryptTOTPSecret } from "../lib/secretCrypto.js";

const PRE_AUTH_TTL_MS = 5 * 60_000; // durée de vie d'une session MFA vérifiée (alignée sur le pré-auth)
import {
  badRequest,
  forbidden,
  notFound,
  ok,
  route,
  serverError,
  unauthorized,
  logError,
} from "../lib/http.js";
import { enforceRateLimit, clientIp } from "../lib/rateLimit.js";
import { expectObject, requireString } from "../lib/validate.js";

/** Enregistre une session MFA vérifiée pour l'agent (utilisée par /admin/auth).
 *  Une seule session active par agent : on PURGE d'abord les lignes existantes
 *  (y compris expirées). Sans purge, un second login < 5 min insérait une 2e
 *  ligne pour le même agent et la lecture `.maybeSingle()` côté /admin/auth
 *  renvoyait PGRST116 (data=null) → console verrouillée en « Second facteur
 *  requis » jusqu'à expiration de toutes les lignes. */
async function markMFASessionVerified(svc, agentId) {
  const { error: purgeError } = await svc
    .from("admin_mfa_sessions")
    .delete()
    .eq("agent_id", agentId);
  if (purgeError) return { error: purgeError };
  return svc.from("admin_mfa_sessions").insert({
    agent_id: agentId,
    expires_at: new Date(Date.now() + PRE_AUTH_TTL_MS).toISOString(),
  });
}

/* ------------------------------------------------------------------ */
/* GET /admin/mfa/status                                            */
/* ------------------------------------------------------------------ */

async function handleStatus(svc, req, res) {
  const admin = await requireAdminRole(svc, req, res);
  if (!admin) return;
  const { agent } = admin;

  await enforceRateLimit(svc, `admin-mfa-status:${agent.authUserId}`, 30, 300);

  return ok(res, {
    mfaEnabled: agent.totpEnabled === true,
    mfaEnabledAt: agent.totpEnabledAt ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* POST /admin/mfa/setup                                            */
/* ------------------------------------------------------------------ */

async function handleSetup(svc, req, res) {
  const admin = await requireAdminRole(svc, req, res);
  if (!admin) return;
  const { agent } = admin;

  await enforceRateLimit(svc, `admin-mfa-setup:${agent.authUserId}`, 5, 300);

  if (agent.totpEnabled === true) {
    return badRequest(res, "Le MFA est déjà activé pour ce compte.");
  }

  const secret = generateTOTPSecret();

  const { error } = await svc
    .from("admin_agents")
    .update({ totp_secret: encryptTOTPSecret(secret) })
    .eq("id", agent.id);
  if (error) {
    logError("admin-mfa-setup", error);
    return serverError(res);
  }

  return ok(res, {
    secret,
    otpauth: buildOTPAuthURI(secret, agent.email),
    mfaEnabled: false,
  });
}

/* ------------------------------------------------------------------ */
/* POST /admin/mfa/verify-setup                                     */
/* ------------------------------------------------------------------ */

async function handleVerifySetup(svc, req, res) {
  const admin = await requireAdminRole(svc, req, res);
  if (!admin) return;
  const { agent } = admin;

  await enforceRateLimit(svc, `admin-mfa-verify-setup:${agent.authUserId}`, 10, 300);

  const body = expectObject(req.body);
  const token = requireString(body, "token", "Le code TOTP", { min: 6, max: 6 });

  if (!agent.totpSecret) {
    return badRequest(res, "Aucun secret TOTP configuré. Lancez d'abord la configuration.");
  }

  if (!verifyTOTPCode(agent.totpSecret, token)) {
    await auditAdmin(svc, {
      actorId: agent.authUserId,
      actorRole: agent.role,
      action: "admin_mfa_setup_failed",
      entity: "admin_agents",
      entityId: agent.id,
      payload: { email: agent.email },
    });
    return badRequest(res, "Code TOTP invalide.");
  }

  const { error } = await svc
    .from("admin_agents")
    .update({ totp_enabled: true, totp_enabled_at: new Date().toISOString() })
    .eq("id", agent.id);
  if (error) {
    logError("admin-mfa-verify-setup", error);
    return serverError(res);
  }

  await auditAdmin(svc, {
    actorId: agent.authUserId,
    actorRole: agent.role,
    action: "admin_mfa_enabled",
    entity: "admin_agents",
    entityId: agent.id,
    payload: { email: agent.email },
  });

  return ok(res, { mfaEnabled: true, message: "MFA activé avec succès." });
}

/* ------------------------------------------------------------------ */
/* POST /admin/mfa/verify                                           */
/* ------------------------------------------------------------------ */

async function handleVerify(svc, req, res) {
  const body = expectObject(req.body);
  const preAuthToken = requireString(body, "preAuthToken", "Le jeton pré-authentifié", { min: 16 });
  const token = requireString(body, "token", "Le code TOTP", { min: 6, max: 6 });

  await enforceRateLimit(svc, `admin-mfa-verify:ip:${clientIp(req) ?? "sans-adresse"}`, 10, 300);

  const agentId = peekPreAuthSession(preAuthToken);
  if (!agentId) {
    return unauthorized(res, "Jeton pré-authentifié invalide ou expiré.");
  }

  const { data: agent, error } = await svc
    .from("admin_agents")
    .select("id, totp_secret, totp_enabled, email, role, status, auth_user_id")
    .eq("id", agentId)
    .maybeSingle();
  if (error || !agent) {
    return unauthorized(res, "Agent introuvable.");
  }
  if (agent.status !== "ACTIF") {
    return forbidden(res, "Ce compte administratif n'est pas actif.");
  }
  if (agent.totp_enabled !== true || !agent.totp_secret) {
    return badRequest(res, "Le MFA n'est pas activé pour ce compte.");
  }

  if (!verifyTOTPCode(decryptTOTPSecret(agent.totp_secret), token)) {
    return badRequest(res, "Code TOTP invalide.");
  }

  // Code valide : le jeton pré-auth n'est consommé qu'ici (un échec TOTP
  // ne force pas un re-login complet).
  consumePreAuthSession(preAuthToken);

  const { error: insertError } = await markMFASessionVerified(svc, agentId);
  if (insertError) {
    logError("admin-mfa-verify", insertError);
    return serverError(res);
  }

  return ok(res, {
    mfaVerified: true,
    email: agent.email,
    role: agent.role,
  });
}

/* ------------------------------------------------------------------ */
/* POST /admin/mfa/disable                                          */
/* ------------------------------------------------------------------ */

async function handleDisable(svc, req, res) {
  const admin = await requireAdminRole(svc, req, res);
  if (!admin) return;
  const { agent } = admin;

  await enforceRateLimit(svc, `admin-mfa-disable:${agent.authUserId}`, 5, 300);

  const body = expectObject(req.body);
  const token = requireString(body, "token", "Le code TOTP", { min: 6, max: 6 });

  if (!agent.totpSecret || agent.totpEnabled !== true) {
    return badRequest(res, "Le MFA n'est pas activé pour ce compte.");
  }

  if (!verifyTOTPCode(agent.totpSecret, token)) {
    return badRequest(res, "Code TOTP invalide.");
  }

  const { error } = await svc
    .from("admin_agents")
    .update({ totp_secret: null, totp_enabled: false, totp_enabled_at: null })
    .eq("id", agent.id);
  if (error) {
    logError("admin-mfa-disable", error);
    return serverError(res);
  }

  await svc.from("admin_mfa_sessions").delete().eq("agent_id", agent.id);

  await auditAdmin(svc, {
    actorId: agent.authUserId,
    actorRole: agent.role,
    action: "admin_mfa_disabled",
    entity: "admin_agents",
    entityId: agent.id,
    payload: { email: agent.email },
  });

  return ok(res, { mfaEnabled: false, message: "MFA désactivé." });
}

// Aiguillage principal : /admin/mfa/* — distribue vers le handler MFA correspondant.
export default route(async (req, res) => {
  const svc = serviceClient();
  const path = req.path;
  const method = req.method;

  if (path === "/admin/mfa/status" && method === "GET") {
    return handleStatus(svc, req, res);
  }
  if (path === "/admin/mfa/setup" && method === "POST") {
    return handleSetup(svc, req, res);
  }
  if (path === "/admin/mfa/verify-setup" && method === "POST") {
    return handleVerifySetup(svc, req, res);
  }
  if (path === "/admin/mfa/verify" && method === "POST") {
    return handleVerify(svc, req, res);
  }
  if (path === "/admin/mfa/disable" && method === "POST") {
    return handleDisable(svc, req, res);
  }

  return notFound(res, "Endpoint MFA introuvable.");
});
