/**
 * Rate limiting adossé à la table public.rate_limits via la RPC atomique
 * sys_rate_limit (migration 15) : incrément atomique en base, compatible
 * avec plusieurs instances Render. L'ancienne lecture-contrôle-écriture
 * souffrait de deux défauts — compteur non atomique et clé falsifiable par
 * le client (premier élément de X-Forwarded-For).
 */

import { isIP } from "node:net";
import { RATE_LIMIT_RE } from "./http.js";
export { RATE_LIMIT_RE };

/** N'accepte qu'une adresse IP littérale valide (IPv4 ou IPv6), sans port. */
function validIp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  return isIP(trimmed) !== 0 ? trimmed : null;
}

/**
 * Adresse client. Avec `trust proxy: 1` (index.js), Express résout req.ip à
 * partir du DERNIER maillon X-Forwarded-For — celui ajouté par Render — et
 * non d'une entrée falsifiée : c'est la source la plus fiable, à condition
 * qu'elle soit une IP valide.
 *
 * En revanche, le repli sur un XFF brut (appel direct / req.ip absent) est
 * durci : une chaîne contenant PLUSIEURS maillons ou une entrée invalide est
 * rejetée en entier (le client peut forger les maillons de gauche). On ne
 * retombe alors que sur X-Real-IP ou l'adresse socket, non falsifiables.
 */
export function clientIp(req) {
  const headers = req?.headers ?? {};

  // req.ip est résolu par Express/proxy-addr avec un seul hop de confiance.
  if (validIp(req?.ip)) return req.ip.trim();

  const xff = headers["x-forwarded-for"];
  if (typeof xff === "string") {
    const parts = xff.split(",").map((v) => v.trim()).filter(Boolean);
    // Un seul maillon, et valide : on peut l'utiliser. Dès qu'il y en a
    // plusieurs, l'en-tête est falsifiable → on l'ignore totalement.
    if (parts.length === 1 && validIp(parts[0])) return parts[0];
  }

  const real = validIp(headers["x-real-ip"]);
  if (real) return real;

  const sock = validIp(req?.socket?.remoteAddress);
  if (sock) return sock;

  // Développement local : pas de proxy Render, l'IP est souvent ::1 ou 127.0.0.1.
  // On utilise l'adresse socket (stable pour une machine donnée) plutôt qu'un
  // UUID aléatoire par requête, sinon le rate limiting serait totalement
  // inefficace en développement (chaque requête aurait une clé différente).
  // Dernier recours : localhost générique (tous les devs partagent la même clé,
  // ce qui est acceptable en local car non exposé sur Internet).
  return "dev:localhost";
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
