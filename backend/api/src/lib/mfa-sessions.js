/**
 * Sessions pré-authentifiées MFA (après mot de passe, avant validation TOTP).
 *
 * Le jeton est désormais STATELESS : c'est un payload { agentId, exp, nonce }
 * encodé en base64url et signé en HMAC-SHA256 avec MFA_PREAUTH_SECRET (ou,
 * pour compatibilité, SERVICE_KEY dérivé via SHA-256). Il survit donc à un
 * redémarrage et reste valide derrière plusieurs instances — la signature
 * garantit qu'il ne peut être ni forgé ni modifié.
 *
 * Seul le nonce des jetons déjà consommés est gardé en mémoire (anti-replay)
 * : ce cache reste propre à une instance. Avec plusieurs instances, un jeton
 * consommé sur l'une pourrait être rejoué sur l'autre ; la fenêtre est de
 * 5 minutes et l'échec TOTP ne consomme pas le jeton. Une table dédiée serait
 * nécessaire pour une garantie multi-instance stricte.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MFA_PREAUTH_SECRET, SERVICE_KEY } from "../config.js";

const PRE_AUTH_TTL_MS = 5 * 60_000; // 5 minutes

/** Clé HMAC dédiée, avec dérivation de service_role pour compatibilité. */
const SIGNING_KEY = (() => {
  const source = MFA_PREAUTH_SECRET || (SERVICE_KEY ? createHash("sha256").update(SERVICE_KEY).digest("hex") : "");
  return source || null;
})();

/** Nonces consommés (anti-replay) : nonce -> expiration du jeton. */
const CONSUMED_NONCES = new Map();

function signature(payloadB64) {
  return createHmac("sha256", SIGNING_KEY).update(payloadB64).digest("hex");
}

/** Nettoyage incrémental des nonces expirés. */
function purgeExpiredNonces() {
  const now = Date.now();
  for (const [nonce, exp] of CONSUMED_NONCES.entries()) {
    if (exp <= now) CONSUMED_NONCES.delete(nonce);
  }
}

/** Vérifie signature, expiration et non-consommation. Retourne le payload ou null. */
function readSession(token) {
  if (!SIGNING_KEY || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = Buffer.from(signature(payloadB64), "hex");
  const provided = Buffer.from(sig, "hex");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.agentId !== "string" || typeof payload.nonce !== "string" || typeof payload.exp !== "number") {
    return null;
  }
  if (payload.exp <= Date.now() || CONSUMED_NONCES.has(payload.nonce)) return null;
  return payload;
}

/** Crée une session pré-authentifiée pour un agent. Retourne le token signé. */
export function createPreAuthSession(agentId) {
  if (!SIGNING_KEY) throw new Error("Configuration serveur incomplète (MFA_PREAUTH_SECRET ou service_role).");
  if (typeof agentId !== "string" || !agentId) return "";
  const payload = {
    agentId,
    exp: Date.now() + PRE_AUTH_TTL_MS,
    nonce: randomBytes(16).toString("hex"),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${signature(payloadB64)}`;
}

/** Consomme (et invalide définitivement) un token. Retourne l'agentId ou null. */
export function consumePreAuthSession(token) {
  const payload = readSession(token);
  if (!payload) return null;
  CONSUMED_NONCES.set(payload.nonce, payload.exp); // à usage unique
  purgeExpiredNonces();
  return payload.agentId;
}

/**
 * Lit un token SANS le consommer (vérifier le code TOTP avant de détruire le
 * jeton : un code erroné ne doit pas forcer un re-login complet).
 * Retourne l'agentId ou null.
 */
export function peekPreAuthSession(token) {
  const payload = readSession(token);
  return payload ? payload.agentId : null;
}

/** Nombre de nonces consommés encore mémorisés (utile pour le monitoring). */
export function preAuthSessionCount() {
  purgeExpiredNonces();
  return CONSUMED_NONCES.size;
}
