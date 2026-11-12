/**
 * Vérification publique du matricule d'école (formulaire /inscription).
 * Contrôles et messages identiques à schoolService.verifyMatricule : format →
 * introuvable → blocage → expiration → inscriptions fermées → ok.
 */

import { serviceClient } from "../lib/auth.js";
import { methodNotAllowed, ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { enforceRateLimit, clientIp } from "../lib/rateLimit.js";

// Handler principal : POST /verify-matricule — vérifie un matricule d'école avant inscription.
export default route(async (req, res) => {
  // POST uniquement : le matricule ne doit pas transiter en query string
  // (historique navigateur, logs d'accès, Referer).
  if (req.method !== "POST") return methodNotAllowed(res);
  const svc = serviceClient();
  try {
    await enforceRateLimit(svc, `verify-matricule:${clientIp(req) ?? "sans-adresse"}`, 20, 600);

    const raw = req.body?.matricule ?? null;
    if (typeof raw !== "string" || raw.trim() === "") {
      return ok(res, { error: "Saisissez le matricule communiqué par votre école." }, 400);
    }
    // Normalisation identique au rate-limit et aux routes register* :
    // trim + majuscules + borne de longueur (anti-balayage).
    const matricule = raw.trim().toUpperCase().slice(0, 20);
    await enforceRateLimit(svc, `verify-matricule:id:${matricule}`, 10, 600);

    const { data: result, error } = await svc.rpc("verify_matricule", { p_matricule: matricule });
    if (error || !result) {
      logError("verify-matricule", error);
      return serverError(res);
    }

    // Le résultat de la vérification est un payload métier (ok/reason/school),
    // pas une erreur HTTP : on renvoie toujours 200 — le front lit `ok` dans
    // le corps. (404/400 renverraient le front sur un throw générique et
    // perdraient le message métier affiché à l'utilisateur.)
    return ok(res, result, 200);
  } catch (e) {
    if (e?.name === "ValidationError") return ok(res, { error: e.message }, 400);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("verify-matricule", e);
    return serverError(res);
  }
});
