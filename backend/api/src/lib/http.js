/**
 * Helpers de réponses HTTP (contrat identique aux Edge Functions Deno) et
 * CORS : le front peut vivre sur une origine différente de celle de l'API.
 *
 * L'enveloppe des réponses reste { ...payload } en succès et { error: "…" }
 * en échec : callFunction() côté front lit payload.error — aucun changement
 * contractuel côté client.
 */

import { FRONTEND_ORIGIN } from "../config.js";

// `cache-control` est toléré pour les clients qui ajoutent volontairement cet
// en-tête : sans lui, leur préflight CORS échoue et le fetch lève une erreur
// réseau (message « Service indisponible » côté front).
const ALLOWED_HEADERS = "authorization, apikey, content-type, x-client-info, cache-control";

/**
 * Origines admises : FRONTEND_ORIGIN (déploiement, liste séparée par des
 * virgules) et, UNIQUEMENT hors production et uniquement si elles sont
 * explicitement listées, les origines locales de développement ci-dessous.
 * Il n'existe AUCUN joker « development » : toute origine non listée est
 * refusée (403), y compris en développement. En production, l'absence de
 * FRONTEND_ORIGIN fait Refuser le démarrage dans index.js (fail-closed).
 */
const DEV_ORIGINS = new Set([
  "http://localhost:5173", "http://127.0.0.1:5173",
  "http://localhost:4173", "http://127.0.0.1:4173",
  "http://localhost:3000", "http://127.0.0.1:3000",
]);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

function allowedOrigin(origin) {
  if (!origin) return false;
  const normalized = origin.replace(/\/$/, "");
  const configured = FRONTEND_ORIGIN.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  if (configured.includes(normalized)) return true;
  // Fail-closed : aucun wildcard. Les origines locales ne sont admises que
  // hors production ET si elles figurent explicitement dans DEV_ORIGINS.
  if (IS_PRODUCTION) return false;
  return DEV_ORIGINS.has(normalized);
}

/** Middleware CORS : autorise l'origine du front, répond au préflight OPTIONS. */
export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  const originAllowed = allowedOrigin(origin);
  if (originAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    // PATCH (agents/écoles) et DELETE (suppression d'école) sont utilisés par
    // le front : sans eux dans Allow-Methods, le préflight du navigateur
    // bloque la requête (invisible en test curl, qui ne préflite pas).
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (origin && !originAllowed) {
    return res.status(403).json({ error: "Origine non autorisée." });
  }
  return next();
}

/** Réponse 405 standard quand la méthode HTTP n'est pas admise. */
export const methodNotAllowed = (res) => res.status(405).json({ error: "Méthode non autorisée." });

/** Réponse JSON de succès. Entrée : res, corps, code HTTP. */
export function ok(res, body, status = 200) {
  res.status(status).json(body);
}

/** Réponse 400 avec message d'erreur métier. */
export const badRequest = (res, message) => ok(res, { error: message }, 400);

export const unauthorized = (res, message = "Session expirée. Reconnectez-vous.") => ok(res, { error: message }, 401);

export const forbidden = (res, message = "Accès refusé.") => ok(res, { error: message }, 403);

export const notFound = (res, message = "Ressource introuvable.") => ok(res, { error: message }, 404);

export const serverError = (res, message = "Une erreur inattendue est survenue. Réessayez dans un instant.") => ok(res, { error: message }, 500);

/**
 * La limite de débit renvoie un message reconnaissable ; chaque route décide
 * du code (429 = tentatives de connexion/paiement, 400 = opérations métier).
 */
export const RATE_LIMIT_RE = /trop de tentatives/i;

/** Log sanitisé d'une erreur : ne consigne jamais l'objet complet (évite de
 * fuiter des fragments de requête, du schéma ou des stack traces dans les
 * logs d'infrastructure). N'affiche que le message et, optionnellement, un
 * préfixe de contexte. */
export function logError(context, e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[${context}]`, msg);
}

/** enveloppe un handler async et traduit ValidationError / crash. */
export function route(handler) {
  return (req, res) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch((e) => {
        if (e?.name === "ValidationError") return badRequest(res, e.message);
        logError("api", new Error(`Non géré sur ${req.method} ${req.path}: ${e?.message ?? String(e)}`));
        return serverError(res);
      });
  };
}

/** Exécute une promesse avec un timeout. Rejette avec une erreur TimeoutError
 * si la promesse ne se résout pas dans le délai imparti (ms). Utilisé pour
 * éviter qu'un appel Supabase bloquant n'épuise les workers Render. */
export function withTimeout(promise, ms, context = "appel Supabase") {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout : ${context} (${ms} ms)`));
    }, ms);
  });
  // finally() couvre AUSSI le rejet (timeout ou erreur amont) : sans cela,
  // le timer restait actif et rejetaient une promesse déjà réglée.
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}
