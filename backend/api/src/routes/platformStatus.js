/**
 * État public de la plateforme, consommé par les écrans (bandeau maintenance,
 * ouverture des inscriptions, délai de déconnexion admin).
 * Aucune donnée sensible : uniquement les réglages destinés à l'affichage.
 */
import { serviceClient } from "../lib/authAdmin.js";
import { ok, route, RATE_LIMIT_RE } from "../lib/http.js";
import { DEFAULT_PLATFORM_SETTINGS, publicPlatformStatus, readPlatformSettings } from "../lib/platformSettings.js";
import { clientIp, enforceRateLimit } from "../lib/rateLimit.js";

// PAS de cache sur cet endpoint : le statut de maintenance doit être frais
// dès que l'admin le désactive (un simple F5 doit suffire sur mobile).
// La protection contre l'amplification est assurée par le rate limit par IP
// ci-dessous, pas par un cache qui servirait des valeurs périmées.
// Handler principal : GET /platform-status — état public de la plateforme (maintenance, inscriptions).
export default route(async (req, res) => {
  if (req.method !== "GET") return ok(res, { error: "Méthode non autorisée." }, 405);

  const svc = serviceClient();
  // Rate limiting avant toute lecture SQL : l'endpoint est public, la borne
  // par IP est la seule protection contre l'amplification. Attrapé ici :
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

  // Réponse jamais mise en cache : navigateurs, proxys et BFCache doivent
  // toujours recharger l'état réel. Le rate limit ci-dessus borne le coût SQL.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");

  try {
    const { settings, migrationApplied } = await readPlatformSettings(svc);
    return ok(res, { ...publicPlatformStatus(settings), migrationApplied });
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
