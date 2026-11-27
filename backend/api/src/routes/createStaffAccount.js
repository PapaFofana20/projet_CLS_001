/**
 * Création d'un accès du personnel (professeur, instituteur, econome,
 * secretaire, surveillant) : réservée au DIRECTEUR de l'école de l'appelant. Le
 * school_id vient du profil (JWT vérifié), jamais du corps de la requête.
 * Le mot de passe est fourni par le directeur (aucun mot de passe temporaire).
 * Limité en débit par compte appelant.
 */

import { audit, isStaffRole, passwordError, requireDirecteur, schoolIsWritable, serviceClient } from "../lib/auth.js";
import { badRequest, forbidden, ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rateLimit.js";
import { expectObject, requireEmail, requireSnPhone, requireString, requireStringArray, ValidationError } from "../lib/validate.js";

// Handler principal : POST /create-staff-account — création d'un accès personnel par le directeur.
export default route(async (req, res) => {
  if (req.method !== "POST") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    const dir = await requireDirecteur(svc, req, res);
    if (!dir) return;
    const { caller } = dir;
    const schoolId = caller.schoolId;

    await enforceRateLimit(svc, `staff-mgmt:${caller.id}`, 30, 300);

    const body = expectObject(req.body);
    const role = requireString(body, "role", "Le rôle", { max: 20 });
    if (!isStaffRole(role)) {
      return badRequest(res, "Rôle invalide.");
    }
    const firstName = requireString(body, "firstName", "Le prénom", { min: 1, max: 60 });
    const lastName = requireString(body, "lastName", "Le nom", { min: 1, max: 60 });
    const email = requireEmail(body);
    const phone = requireSnPhone(body, "phone", "Le téléphone");
    const specialties = requireStringArray(body, "specialties", "Les spécialités");
    // Mot de passe DÉFINITIF choisi par le directeur (obligatoire, pas de temporaire)
    const password = requireString(body, "password", "Le mot de passe", { min: 8, max: 72, trim: false });
    const pwError = passwordError(password);
    if (pwError) return badRequest(res, `Mot de passe invalide : ${pwError}`);

    if (!(await schoolIsWritable(svc, schoolId))) {
      return forbidden(res, "Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées.");
    }

    const { data: created, error: createError } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role, school_id: schoolId },
    });
    if (createError || !created?.user) {
      const duplicate = /already|duplicate|registered/i.test(createError?.message ?? "");
      return badRequest(
        res,
        duplicate ? "Un compte existe déjà avec cet e-mail." : "Impossible de créer l'accès. Réessayez.",
      );
    }

    try {
      const { error } = await svc.rpc("finish_staff_registration", {
        p_user_id: created.user.id,
        p_school_id: schoolId,
        p_role: role,
        p_first_name: firstName,
        p_last_name: lastName,
        p_phone: phone,
        p_email: email,
        p_specialties: role === "professeur" ? specialties : [],
      });
      if (error) throw new Error(error.message);

      await audit(svc, {
        schoolId,
        actorId: caller.id,
        actorRole: caller.role,
        action: "staff_account_created",
        entity: "profiles",
        entityId: created.user.id,
        payload: { role },
      });
      return ok(res, {
        userId: created.user.id,
        email,
        // Le mot de passe vient de la requête (saisi par la direction) : on ne
        // le renvoie pas — le front l'a déjà et aucun intermédiaire ne doit le
        // réémettre.
        firstName,
        lastName,
        role,
      });
    } catch (sqlError) {
      await svc.auth.admin.deleteUser(created.user.id);
      const message = sqlError instanceof Error ? sqlError.message : undefined;
      if (message && /un compte existe déjà|rôle invalide/i.test(message)) {
        logError("create-staff-account:rpc", sqlError);
        return badRequest(res, "Impossible de créer l'accès. Vérifiez les informations saisies et réessayez.");
      }
      logError("create-staff-account", sqlError);
      return serverError(res);
    }
  } catch (e) {
    if (e?.name === "ValidationError") return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return badRequest(res, e.message);
    logError("create-staff-account", e);
    return serverError(res);
  }
});
