/**
 * Suppression définitive d'un accès du personnel (direction).
 * Supprime le compte Auth : le profil est supprimé en cascade
 * (profiles.id references auth.users on delete cascade). La fiche
 * enseignant éventuellement liée n'est PAS supprimée : l'enseignant
 * reste dans la liste, simplement « Sans accès ». Pour retirer aussi
 * l'enseignant, utiliser la suppression d'enseignant (teachers).
 * Impossible sur son propre compte ni sur un compte directeur.
 * Limité en débit par compte appelant.
 */

import { audit, isStaffRole, requireDirecteur, schoolIsWritable, serviceClient } from "../lib/auth.js";
import { badRequest, forbidden, notFound, ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rateLimit.js";
import { expectObject, requireUuid, ValidationError } from "../lib/validate.js";

// Handler principal : POST /delete-staff-account — suppression définitive d'un accès personnel.
export default route(async (req, res) => {
  if (req.method !== "POST") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    const dir = await requireDirecteur(svc, req, res);
    if (!dir) return;
    const { caller } = dir;

    await enforceRateLimit(svc, `staff-mgmt:${caller.id}`, 30, 300);

    // Garde d'abonnement (fail-closed, comme createStaffAccount/updateStaff) :
    // une école expirée/suspendue ne peut pas supprimer de comptes.
    if (!(await schoolIsWritable(svc, caller.schoolId))) {
      return badRequest(res, "L'abonnement de votre école n'est pas actif. Renouvelez pour gérer les comptes du personnel.");
    }

    const body = expectObject(req.body);
    const userId = requireUuid(body, "userId", "Le compte");

    const { data: target, error } = await svc
      .from("profiles")
      .select("id, school_id, role")
      .eq("id", userId)
      .maybeSingle();
    if (error || !target || target.school_id !== caller.schoolId) {
      return ok(res, { error: "Compte introuvable dans votre école." }, 404);
    }
    if (target.role === "directeur") {
      return badRequest(res, "Le compte directeur ne peut pas être supprimé depuis l'application.");
    }
    if (!isStaffRole(target.role)) {
      return badRequest(res, "Seuls les comptes du personnel peuvent être supprimés ici.");
    }
    if (userId === caller.id) {
      return badRequest(res, "Vous ne pouvez pas supprimer votre propre compte.");
    }

    const { error: deleteError } = await svc.auth.admin.deleteUser(userId);
    if (deleteError) return serverError(res);

    await audit(svc, {
      schoolId: caller.schoolId,
      actorId: caller.id,
      actorRole: caller.role,
      action: "staff_account_deleted",
      entity: "profiles",
      entityId: userId,
      payload: { role: target.role },
    });

    return ok(res, { userId, deleted: true });
  } catch (e) {
    if (e?.name === "ValidationError") return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return badRequest(res, e.message);
    logError("delete-staff-account", e);
    return serverError(res);
  }
});
