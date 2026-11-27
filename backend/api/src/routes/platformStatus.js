/**
 * État public de la plateforme, consommé par les écrans (bandeau maintenance,
 * ouverture des inscriptions, délai de déconnexion admin).
 * Aucune donnée sensible : uniquement les réglages destinés à l'affichage.
 */
import { serviceClient } from "../lib/authAdmin.js";
import { ok, route, RATE_LIMIT_RE } from "../lib/http.js";
import { DEFAULT_PLATFORM_SETTINGS, publicPlatformStatus, readPlatformSettings } from "../lib/platformSettings.js";
import { clientIp, enforceRateLimit } from "../lib/rateLimit.js";

// Cache mémoire partagé par les requêtes de ce processus (TTL 5 s).
// Un TTL court limite le risque de servir des valeurs périmées après un
// changement de maintenance ou d'inscription côté base.
const CACHE_TTL_MS = 5_000;
let cache = null;

// Handler principal : GET /platform-status — état public de la plateforme (maintenance, inscriptions).
export default route(async (req, res) => {
  if (req.method !== "GET") return ok(res, { error: "Méthode non autorisée." }, 405);

  const svc = serviceClient();
  // Rate limiting AVANT le cache : un cache-hit ne doit pas contourner la
  // borne (sinon l'endpoint public est illimité en cache). Attrapé ici :
  // « Trop de tentatives » doit sortir en 429 et non en 500 (le repli
  // fail-closed ci-dessous est réservé aux erreurs de lecture SQL).
  try {
    await enforceRateLimit(svc, `platform-status:${clientIp(req) ?? "sans-adresse"}`, 60, 300);
  } catch (e) {
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) {
      return ok(res, { error: e.message }, 429);
    }
    throw e;
  }

  // Cache mémoire (TTL 30 s) : /platform-status est public et non borné — sans
  // cache, chaque requête scriptee coûte 1 lecture SQL (amplification DoS).
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    res.setHeader("Cache-Control", "public, max-age=30");
    return ok(res, cache.body);
  }
  const respond = (body) => {
    cache = { at: now, body };
    res.setHeader("Cache-Control", "public, max-age=30");
    return ok(res, body);
  };

  try {
    const { settings, migrationApplied } = await readPlatformSettings(svc);
    return respond({ ...publicPlatformStatus(settings), migrationApplied });
  } catch (e) {
    // Fail-closed SANS cache : en cas d'erreur SQL on ne renvoie PAS les
    // valeurs par défaut (registrationOpen: true) — ce serait annoncer
    // « inscriptions ouvertes » alors que l'état réel est inconnu. On
    // publie un état explicite « indisponible », non mis en cache afin que
    // la prochaine requête retente la lecture réelle.
    console.warn("[platform-status] état indisponible (lecture SQL en échec) :", e?.message ?? e);
    res.setHeader("Cache-Control", "no-store");
    return ok(res, {
      ...publicPlatformStatus(DEFAULT_PLATFORM_SETTINGS),
      registrationOpen: false,
      maintenanceMode: true,
      maintenanceMessage: "État de la plateforme indisponible. Réessayez dans un instant.",
      status: "indisponible",
      migrationApplied: false,
    });
  }
});
