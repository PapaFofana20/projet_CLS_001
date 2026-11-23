/**
 * Authentification et autorisation de l'API (portage des modules partagés
 * Deno). Le JWT Supabase est VÉRIFIÉ par Supabase Auth lui-même — jamais de
 * décodage base64 sans signature.
 */

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY } from "../config.js";

/** Client service_role — NE JAMAIS l'exposer au navigateur.
 * Instance unique (singleton) réutilisée par toutes les routes, afin d'éviter
 * de recréer un client à chaque requête HTTP. Le pooling de connexions
 * PostgreSQL lui-même est géré côté infrastructure par Supabase / PgBouncer. */
const _svcBySchema = new Map();

export function serviceClient(options = {}) {
  if (!SERVICE_KEY) {
    throw new Error("Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY).");
  }
  const schema = options.dbSchema ?? "public";
  if (!_svcBySchema.has(schema)) {
    _svcBySchema.set(
      schema,
      createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        db: { schema },
      }),
    );
  }
  return _svcBySchema.get(schema);
}

/** Vérifie le JWT d'un utilisateur connecté auprès de Supabase Auth. */
export async function getAuthenticatedUser(svc, req) {
  const jwt = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await svc.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

/**
 * Révoque les sessions (refresh tokens) d'un utilisateur via la RPC
 * admin_revoke_user_sessions (migration 00043), réservée au service_role.
 * Best-effort : un échec ne bloque jamais l'opération métier, mais il est
 * journalisé (la RLS is_active_user() reste la barrière de fond).
 */
/**
 * Révoque les sessions (refresh tokens) d'un utilisateur via la RPC
 * admin_revoke_user_sessions (migration 00043), réservée au service_role.
 * Retry exponentiel (3 tentatives) en cas de blip réseau : une révocation
 * ratée laisserait des refresh tokens valides après un changement de mot de
 * passe ou une désactivation de compte.
 */
export async function revokeUserSessions(svc, userId, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { error } = await svc.rpc("admin_revoke_user_sessions", { p_user_id: userId });
      if (!error) return;
      lastError = new Error(error.message ?? error);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < maxRetries) {
      // Backoff exponentiel : 200ms, 400ms, 800ms.
      await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** (attempt - 1)));
    }
  }
  console.warn("[revoke-sessions]", lastError?.message ?? lastError);
}

/** Profil de l'appelant (JWT vérifié + ligne profiles). Entrée : svc, req. Sortie : profil normalisé ou null. */
export async function getCallerProfile(svc, req) {
  const user = await getAuthenticatedUser(svc, req);
  if (!user) return null;
  const { data: profile, error } = await svc
    .from("profiles")
    .select("id, school_id, role, status, must_change_password, teacher_id, parent_id, student_id, email")
    .eq("id", user.id)
    .single();
  if (error || !profile) return null;
  return {
    id: profile.id,
    email: profile.email,
    schoolId: profile.school_id,
    role: profile.role,
    status: profile.status,
    teacherId: profile.teacher_id,
    parentId: profile.parent_id,
    studentId: profile.student_id,
    mustChangePassword: profile.must_change_password,
    appMetadata: user.app_metadata ?? {},
  };
}

/**
 * Exige un directeur ACTIF de sa propre école (school_id vient du profil).
 * Le statut est contrôlé ici : un compte désactivé ne doit plus gérer le
 * personnel (maj, réinitialisation, activation) même avec un JWT encore
 * valide — les RLS ferment déjà l'accès aux données, pas ces endpoints.
 */
export async function requireDirecteur(svc, req, res) {
  const caller = await getCallerProfile(svc, req);
  if (!caller) {
    unauthorized(res);
    return null;
  }
  if (caller.status !== "ACTIF") {
    forbidden(res, "Ce compte n'est plus actif. Contactez la direction de votre école.");
    return null;
  }
  if (caller.role !== "directeur" || caller.schoolId === null) {
    forbidden(res, "Seule la direction peut effectuer cette action.");
    return null;
  }
  return { caller };
}

/** Rôles gérables depuis l'espace direction (jamais parent/élève/directeur). */
export const STAFF_ROLES = Object.freeze(["professeur", "instituteur", "econome", "secretaire", "surveillant"]);

/** Vrai si le rôle fait partie du personnel gérable par la direction. Entrée : rôle. Sortie : booléen. */
export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

/** Vérifie l'abonnement côté serveur, sans faire confiance au client. */
export async function schoolIsWritable(svc, schoolId) {
  const { data, error } = await svc.rpc("school_is_writable", { p_school_id: schoolId });
  if (error) throw new Error("Impossible de vérifier l'état de l'abonnement.");
  return data === true;
}

/* ------------------------------------------------------------------ */
/* Journal d'audit (aucune donnée personnelle d'élève dans le payload)  */
/* ------------------------------------------------------------------ */

export async function audit(svc, entry) {
  try {
    await svc.from("audit_log").insert({
      school_id: entry.schoolId ?? null,
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

/* ------------------------------------------------------------------ */
/* Mots de passe temporaires (identiques à utils/password.ts au front)  */
/* ------------------------------------------------------------------ */

const PASSWORD_MIN = 8;
const READABLE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

/** Tirage uniforme sans biais modulo (rejet d'échantillonnage). */
function randomBelow(limit) {
  const limit32 = 0x100000000;
  const range = Math.floor(limit32 / limit) * limit;
  const buf = new Uint32Array(1);
  let b;
  do {
    crypto.getRandomValues(buf);
    b = buf[0];
  } while (b >= range);
  return b % limit;
}

/** Valide la solidité d'un mot de passe. Entrée : mot de passe. Sortie : message d'erreur ou null si valide. */
export function passwordError(value) {
  if (!value) return "Le mot de passe est obligatoire.";
  if (value.length < PASSWORD_MIN) return `Au moins ${PASSWORD_MIN} caractères.`;
  const missing = [];
  if (!/[a-z]/.test(value)) missing.push("une lettre minuscule");
  if (!/[A-Z]/.test(value)) missing.push("une lettre majuscule");
  if (!/\d/.test(value)) missing.push("un chiffre");
  if (missing.length) return `Il manque : ${missing.join(", ")}.`;
  return null;
}

/** Génère un mot de passe temporaire lisible de 12 caractères. Sortie : chaîne. */
export function generateTempPassword() {
  const chars = Array.from({ length: 12 }, () => READABLE[randomBelow(READABLE.length)]);
  chars[0] = LOWER[randomBelow(LOWER.length)];
  chars[1] = UPPER[randomBelow(UPPER.length)];
  chars[2] = DIGITS[randomBelow(DIGITS.length)];
  chars[3] = LOWER[randomBelow(LOWER.length)];
  return chars.join("");
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const SN_PHONE_RE = /^(\+221)?\s?7(?:0|[5-8])\s?\d{3}\s?\d{2}\s?\d{2}$/;
