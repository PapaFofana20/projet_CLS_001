/**
 * Sessions pré-authentifiées MFA (après mot de passe, avant validation TOTP).
 *
 * Stockage en mémoire avec TTL (5 min). Perdu au redémarrage : une nouvelle
 * authentification complète est alors requise, ce qui est acceptable pour un
 * second facteur (pas de session persistante sans re-saisie du mot de passe).
 */
import { randomBytes } from "node:crypto";

const PRE_AUTH_SESSIONS = new Map();
const PRE_AUTH_TTL_MS = 5 * 60_000; // 5 minutes

/** Crée une session pré-authentifiée pour un agent. Retourne le token opaque. */
export function createPreAuthSession(agentId) {
  const token = randomBytes(24).toString("hex");
  PRE_AUTH_SESSIONS.set(token, { agentId, expiresAt: Date.now() + PRE_AUTH_TTL_MS });
  if (PRE_AUTH_SESSIONS.size > 10_000) {
    const now = Date.now();
    for (const [k, v] of PRE_AUTH_SESSIONS.entries()) {
      if (v.expiresAt < now) PRE_AUTH_SESSIONS.delete(k);
    }
  }
  return token;
}

/** Consomme (et supprime) une session pré-authentifiée. Retourne l'agentId ou null. */
export function consumePreAuthSession(token) {
  const entry = PRE_AUTH_SESSIONS.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    PRE_AUTH_SESSIONS.delete(token);
    return null;
  }
  PRE_AUTH_SESSIONS.delete(token); // à usage unique
  return entry.agentId;
}

/**
 * Lit une session pré-authentifiée SANS la consommer (pour vérifier le code
 * TOTP avant de détruire le jeton : un code erroné ne doit pas forcer un
 * re-login complet). Retourne l'agentId ou null.
 */
export function peekPreAuthSession(token) {
  const entry = PRE_AUTH_SESSIONS.get(token);
  if (!entry || entry.expiresAt < Date.now()) {
    PRE_AUTH_SESSIONS.delete(token);
    return null;
  }
  return entry.agentId;
}

/** Nombre de sessions actives (utile pour le monitoring / santé). */
export function preAuthSessionCount() {
  return PRE_AUTH_SESSIONS.size;
}
