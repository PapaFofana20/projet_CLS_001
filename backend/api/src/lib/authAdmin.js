/**
 * Authentification et autorisation des agents administratifs Classora.
 * L'identité vient du profil admin_agents (table séparée de profiles),
 * jamais du client. Seul un agent ACTIF peut accéder aux routes admin.
 */

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY } from "../config.js";
import { unauthorized, forbidden } from "./http.js";
import { decryptTOTPSecret } from "./secretCrypto.js";

/** Client service_role pour les routes admin (même principe que lib/auth.js). Entrée : options. Sortie : client Supabase. */
export function serviceClient(options = {}) {
  if (!SERVICE_KEY) {
    throw new Error("Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY).");
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: options.dbSchema ?? "public" },
  });
}

/** Vérifie le JWT d'un agent admin auprès de Supabase Auth. Entrée : svc, req. Sortie : utilisateur ou null. */
export async function getAuthenticatedUser(svc, req) {
  const jwt = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await svc.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

/**
 * Récupère le profil admin_agent de l'appelant.
 * Renvoie { caller, agent } ou null si aucun profil admin.
 */
export async function getCallerAdminAgent(svc, req) {
  const user = await getAuthenticatedUser(svc, req);
  if (!user) return null;

  const { data: agent, error } = await svc
    .from("admin_agents")
    .select("id, matricule, role, status, first_name, last_name, email, phone, auth_user_id, totp_secret, totp_enabled, totp_enabled_at, created_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !agent) return null;

  return {
    caller: {
      id: agent.auth_user_id,
      email: agent.email,
      schoolId: null,
      role: agent.role,
      status: agent.status,
      teacherId: null,
      parentId: null,
      studentId: null,
      mustChangePassword: false,
      appMetadata: { role: agent.role, school_id: null },
    },
    agent: {
      id: agent.id,
      matricule: agent.matricule,
      role: agent.role,
      status: agent.status,
      firstName: agent.first_name,
      lastName: agent.last_name,
      email: agent.email,
      phone: agent.phone,
      authUserId: agent.auth_user_id,
      totpSecret: agent.totp_secret ? decryptTOTPSecret(agent.totp_secret) : null,
      totpEnabled: agent.totp_enabled === true,
      totpEnabledAt: agent.totp_enabled_at ?? null,
      createdAt: agent.created_at,
    },
  };
}

/**
 * Exige un agent admin ACTIF, avec granularité de rôle optionnelle.
 * Par défaut : superadmin, admin, agent_suivi. Les routes exposant des
 * données personnelles ou sensibles passent `roles` pour restreindre
 * (ex. ["admin", "superadmin"]) — agent_suivi est limité aux agrégats.
 */
export async function requireAdminRole(svc, req, res, roles = ["superadmin", "admin", "agent_suivi"]) {
  const result = await getCallerAdminAgent(svc, req);
  if (!result) {
    unauthorized(res, "Aucun profil administrateur associé à ce compte.");
    return null;
  }
  const { caller, agent } = result;
  if (agent.status !== "ACTIF") {
    forbidden(res, `Ce compte administratif est ${agent.status === "DESACTIVE" ? "désactivé" : "en attente de validation"}.`);
    return null;
  }
  if (!roles.includes(agent.role)) {
    forbidden(res, "Votre rôle ne permet pas d'accéder à cette ressource.");
    return null;
  }
  return { caller, agent };
}

/**
 * Exige le rôle superadmin.
 */
export async function requireSuperAdmin(svc, req, res) {
  const result = await requireAdminRole(svc, req, res);
  if (!result) return null;
  const { caller, agent } = result;
  if (agent.role !== "superadmin") {
    forbidden(res, "Seul le superadministrateur peut effectuer cette action.");
    return null;
  }
  return { caller, agent };
}

/**
 * Génère une matricule administrative unique (CLA-ADM-000001) via RPC service_role.
 */
export async function generateAdminMatricule(svc) {
  const { data, error } = await svc.rpc("generate_admin_matricule");
  if (error || !data) throw new Error("Impossible de générer la matricule administrative.");
  return data;
}

/**
 * Journal d'audit pour les actions administratives (school_id = null).
 */
export async function auditAdmin(svc, entry) {
  try {
    await svc.from("audit_log").insert({
      school_id: null,
      actor_id: entry.actorId ?? null,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      payload: entry.payload ?? {},
    });
  } catch {
    // L'audit ne doit jamais faire échouer l'opération métier.
  }
}