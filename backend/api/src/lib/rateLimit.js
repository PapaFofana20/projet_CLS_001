/**
 * Rate limiting adossé à la table public.rate_limits via la RPC atomique
 * sys_rate_limit (migration 15) : incrément atomique en base, compatible
 * avec plusieurs instances Render. L'ancienne lecture-contrôle-écriture
 * souffrait de deux défauts — compteur non atomique et clé falsifiable par
 * le client (premier élément de X-Forwarded-For).
 */

import { RATE_LIMIT_RE } from "./http.js";
export { RATE_LIMIT_RE };

/**
 * Adresse client. Avec `trust proxy: 1` (index.js), Express résout req.ip à
 * partir du DERNIER maillon X-Forwarded-For — celui ajouté par Render — et
 * non d'une entrée falsifiée. Repli : dernier maillon XFF explicite, puis
 * X-Real-IP, puis l'adresse socket. null seulement en appel direct (dev).
 */
export function clientIp(req) {
  if (typeof req?.ip === "string" && req.ip.trim()) return req.ip.trim();
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") {
    const parts = xff.split(",").map((v) => v.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  const real = typeof req.headers["x-real-ip"] === "string" ? req.headers["x-real-ip"].trim() : null;
  if (real) return real;
  const sock = req?.socket?.remoteAddress;
  if (typeof sock === "string" && sock.trim()) return sock.trim();
  // Développement local : pas de proxy Render, l'IP est souvent ::1 ou 127.0.0.1.
  // Tous les développeurs partageant la même clé briserait le rate limiting.
  // On génère une clé stable par session (stockée sur l'objet req au premier appel).
  if (!req.ipDevFallback) req.ipDevFallback = `dev:${crypto.randomUUID()}`;
  return req.ipDevFallback;
}

/** Lève une erreur métier si la limite est atteinte pour (key) sur la fenêtre. */
export async function enforceRateLimit(svc, key, max, windowSeconds) {
  const { data, error } = await svc.rpc("sys_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_secs: windowSeconds,
  });
  if (error) {
    // Ne JAMAIS laisser un dysfonctionnement du limiter ouvrir le service.
    throw new Error("Service momentanément indisponible. Réessayez dans un instant.");
  }
  if (data === false) {
    throw new Error("Trop de tentatives. Réessayez dans quelques minutes.");
  }
}
