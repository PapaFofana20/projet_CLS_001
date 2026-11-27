/**
 * Connexion administrative par matricule ou e-mail : résout l'identifiant en
 * e-mail APRÈS vérification du mot de passe auprès de Supabase Auth. Sans
 * secret valide, aucune information n'est révélée — les matricules étant
 * séquentielles (CLA-ADM-000002…), une simple table de correspondance
 * publierait les e-mails de toute l'équipe.
 *
 * Le client termine ensuite par signInWithPassword(email, password) : les
 * jetons de session restent gérés par Supabase côté navigateur, rien ne
 * change pour /admin/auth.
 */
import { createHash } from "node:crypto";
import { SERVICE_KEY, SUPABASE_URL } from "../config.js";
import { auditAdmin, serviceClient } from "../lib/authAdmin.js";
import { badRequest, ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { clientIp, enforceRateLimit } from "../lib/rateLimit.js";
import { expectObject, requireString } from "../lib/validate.js";
import { createPreAuthSession } from "../lib/mfa-sessions.js";

const MATRICULE_RE = /^CLA-ADM-\d{6}$/;
const GENERIC_ERROR = "Matricule/e-mail ou mot de passe incorrect.";

/** Verrouillage progressif persistant : compteur d'échecs consécutifs par
 * identifiant, stocké dans la table public.rate_limits via la RPC atomique
 * sys_rate_limit (service_role uniquement). Survit aux redémarrages du
 * processus (contrairement à une Map en mémoire).
 * Après 3 échecs consécutifs, le compte est verrouillé 15 minutes. Le
 * compteur n'est incrémenté QU'EN cas d'échec réel (mot de passe invalide ou
 * identifiant inconnu) ; une connexion réussie supprime la ligne (reset
 * immédiat), ce qui évite de verrouiller un agent légitime après des
 * tentatives réussies.
 */
const LOCKOUT_MAX_FAILURES = 3;
const LOCKOUT_WINDOW_SECONDS = 15 * 60; // 15 minutes
const LOCKOUT_KEY_PREFIX = "admin-login:lockout:";

const lockoutKey = (identifier) => `${LOCKOUT_KEY_PREFIX}${identifier}`;

/** LIT le compteur sans l'incrémenter. Interroge directement rate_limits en
 * service_role (les anon/authenticated n'ont aucun accès à cette table).
 * La fenêtre est vérifiée côté lecture pour ignorer une ligne périmée. */
async function readLockoutCount(svc, identifier) {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_SECONDS * 1000).toISOString();
  const { data, error } = await svc
    .from("rate_limits")
    .select("count")
    .eq("key", lockoutKey(identifier))
    .gte("window_start", since)
    .maybeSingle();
  if (error) return 0; // panne DB : on ne bloque pas (fail-open pour le verrouillage)
  return Math.max(0, Number(data?.count ?? 0));
}

/** Vérifie si l'identifiant est verrouillé (3 échecs consécutifs dans la fenêtre). */
async function isLockedOut(svc, identifier) {
  return (await readLockoutCount(svc, identifier)) >= LOCKOUT_MAX_FAILURES;
}

/** Incrémente atomiquement le compteur d'échecs via sys_rate_limit. */
async function recordFailedLogin(svc, identifier) {
  const { error } = await svc.rpc("sys_rate_limit", {
    p_key: lockoutKey(identifier),
    p_max: LOCKOUT_MAX_FAILURES,
    p_window_secs: LOCKOUT_WINDOW_SECONDS,
  });
  if (error) logError("admin-login:lockout", error);
}

/** Vérifie (email, password) directement auprès de Supabase Auth. */
async function passwordIsValid(email, password) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    // Timeout ou panne réseau : refus, sans distinguer la cause au client.
    return false;
  }
}

// Handler principal : POST /admin/login — connexion admin par matricule ou e-mail.
export default route(async (req, res) => {
  if (req.method !== "POST") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    const body = expectObject(req.body);
    const identifier = requireString(body, "identifier", "L'identifiant", { min: 3, max: 120 });
    const password = requireString(body, "password", "Le mot de passe", { min: 1, max: 72, trim: false });

    const isMatricule = MATRICULE_RE.test(identifier.toUpperCase());
    const value = isMatricule ? identifier.toUpperCase() : identifier.toLowerCase();

    // Débit limité par adresse IP ET par identifiant, avant tout indice.
    await enforceRateLimit(svc, `admin-login:ip:${clientIp(req) ?? "sans-adresse"}`, 20, 300);
    await enforceRateLimit(svc, `admin-login:id:${value}`, 10, 300);

    // Verrouillage progressif persistant après échecs consécutifs (H-03 de l'audit).
    // isLockedOut() LIT seulement le compteur : l'incrément a lieu plus bas,
    // uniquement sur échec avéré du mot de passe ou identifiant inconnu.
    if (await isLockedOut(svc, value)) {
      return ok(res, { error: "Compte temporairement verrouillé. Réessayez dans 15 minutes." }, 429);
    }

    // L'identifiant doit correspondre à un agent administratif connu.
    let query = svc.from("admin_agents").select("id, matricule, role, status, email, auth_user_id, totp_enabled");
    query = isMatricule ? query.eq("matricule", value) : query.eq("email", value);
    const { data: agent, error } = await query.maybeSingle();
    if (error || !agent) {
      // Même vérification de mot de passe (jetée) que sur le chemin « agent
      // trouvé » : sans cela, la latence trahissait l'existence d'une
      // matricule — or elles sont séquentielles et donc énumérables.
      await passwordIsValid("matricule-inconnue@classora.invalid", password);
      // Un identifiant inconnu compte aussi comme un échec : sans cela, un
      // attaquant pourrait contourner le verrouillage en changeant de clé.
      await recordFailedLogin(svc, value);
      await auditAdmin(svc, {
        actorId: null,
        actorRole: null,
        action: "admin_login_failed",
        entity: "admin_agents",
        entityId: null,
        payload: {
          // Empreinte courte plutôt que l'e-mail/matricule en clair dans le journal.
          identifierHash: createHash("sha256").update(value).digest("hex").slice(0, 12),
        },
      });
      return ok(res, { error: GENERIC_ERROR }, 401);
    }

    if (!(await passwordIsValid(agent.email, password))) {
      await recordFailedLogin(svc, value);
      await auditAdmin(svc, {
        actorId: agent.auth_user_id,
        actorRole: agent.role,
        action: "admin_login_failed",
        entity: "admin_agents",
        entityId: agent.id,
        payload: { matricule: agent.matricule },
      });
      return ok(res, { error: GENERIC_ERROR }, 401);
    }

    if (agent.status !== "ACTIF") {
      await auditAdmin(svc, {
        actorId: agent.auth_user_id,
        actorRole: agent.role,
        action: "admin_login_blocked",
        entity: "admin_agents",
        entityId: agent.id,
        payload: { status: agent.status, matricule: agent.matricule },
      });
      return ok(res, {
        error: `Ce compte administratif est ${agent.status === "DESACTIVE" ? "désactivé" : "en attente de validation"}. Contactez le superadministrateur.`,
      }, 403);
    }

    await auditAdmin(svc, {
      actorId: agent.auth_user_id,
      actorRole: agent.role,
      action: "admin_login_matricule",
      entity: "admin_agents",
      entityId: agent.id,
      payload: { matricule: agent.matricule },
    });

    // Connexion réussie : reset immédiat du compteur de verrouillage. Sans
    // cette suppression, des échecs anciens (encore dans la fenêtre de 15 min)
    // continuaient de faire verrouiller un agent pourtant authentifié.
    const { error: resetError } = await svc.from("rate_limits").delete().eq("key", lockoutKey(value));
    if (resetError) logError("admin-login:reset-lockout", resetError);

    // Si le MFA est activé, on ne retourne pas encore l'email : il faut
    // d'abord valider le second facteur via POST /admin/mfa/verify.
    if (agent.totp_enabled === true) {
      const preAuthToken = createPreAuthSession(agent.id);
      await auditAdmin(svc, {
        actorId: agent.auth_user_id,
        actorRole: agent.role,
        action: "admin_login_mfa_required",
        entity: "admin_agents",
        entityId: agent.id,
        payload: { matricule: agent.matricule },
      });
      return ok(res, { mfaRequired: true, preAuthToken });
    }

    return ok(res, { email: agent.email });
  } catch (e) {
    if (e?.name === "ValidationError") return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("admin-login", e);
    return serverError(res);
  }
});
