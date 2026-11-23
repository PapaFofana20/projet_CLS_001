/**
 * Réinitialisation du mot de passe d'un accès du personnel (direction) :
 * nouveau mot de passe temporaire, affiché UNE SEULE FOIS, le compte repasse
 * en « changement de mot de passe obligatoire » à sa prochaine connexion.
 * Limité en débit par compte appelant.
 */

import { audit, isStaffRole, passwordError, requireDirecteur, revokeUserSessions, schoolIsWritable, serviceClient } from "../lib/auth.js";
import { badRequest, forbidden, ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rateLimit.js";
import { expectObject, requireUuid } from "../lib/validate.js";

// Handler principal : POST /reset-staff-password — réinitialisation du mot de passe d'un membre du personnel.
export default route(async (req, res) => {
  if (req.method !== "POST") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    const dir = await requireDirecteur(svc, req, res);
    if (!dir) return;
    const { caller } = dir;

    await enforceRateLimit(svc, `staff-mgmt:${caller.id}`, 30, 300);
    if (!(await schoolIsWritable(svc, caller.schoolId))) {
      return forbidden(res, "Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées.");
    }

    const body = expectObject(req.body);
    const userId = requireUuid(body, "userId", "Le compte");
    // Le directeur fournit le nouveau mot de passe : aucun secret n'est généré
    // ni transmis par le serveur. Le mot de passe est validé avant écriture.
    const newPassword = requireString(
      body,
      "newPassword",
      "Le nouveau mot de passe",
      { min: 8, max: 72, trim: false }
    );
    const pwError = passwordError(newPassword);
    if (pwError) return badRequest(res, `Mot de passe invalide : ${pwError}`);

    const { data: target, error } = await svc
      .from("profiles")
      .select("id, school_id, role, first_name, last_name, email, status")
      .eq("id", userId)
      .maybeSingle();
    if (error || !target || target.school_id !== caller.schoolId) {
      return ok(res, { error: "Compte introuvable dans votre école." }, 404);
    }
    if (target.role === "directeur") {
      return badRequest(res, "Le compte directeur sera réinitialisé via le service support.");
    }
    if (!isStaffRole(target.role)) {
      return badRequest(res, "Seuls les comptes du personnel peuvent être réinitialisés ici.");
    }

    const { error: authError } = await svc.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (authError) {
      logError("reset-staff-password", authError);
      return serverError(res);
    }
    // Le nouveau mot de passe invalide les usages futurs ; on révoque aussi
    // les refresh tokens existants (l'ancienne session ne prolonge plus rien).
    await revokeUserSessions(svc, userId);

    // Le mot de passe vient du directeur (saisi côté client) : le compte
    // repasse en « changement de mot de passe obligatoire » à sa prochaine
    // connexion, afin que l'utilisateur s'approprie son propre secret.
    const { error: flagError } = await svc
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", userId);
    if (flagError) {
      logError("reset-staff-password", flagError);
      return serverError(res);
    }

    await audit(svc, {
      schoolId: caller.schoolId,
      actorId: caller.id,
      actorRole: caller.role,
      action: "staff_password_reset",
      entity: "profiles",
      entityId: userId,
    });

    res.setHeader("Cache-Control", "no-store");
    return ok(res, {
      userId,
      email: target.email,
      firstName: target.first_name,
      lastName: target.last_name,
      role: target.role,
    });
  } catch (e) {
    if (e?.name === "ValidationError") return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return badRequest(res, e.message);
    logError("reset-staff-password", e);
    return serverError(res);
  }
});
