/**
 * Modification d'un accès du personnel par la direction : identité, téléphone,
 * e-mail, spécialités. Synchronise la ligne teachers du personnel enseignant.
 * Limité en débit par compte appelant.
 */

import { audit, EMAIL_RE, SN_PHONE_RE, isStaffRole, requireDirecteur, schoolIsWritable, serviceClient } from "../lib/auth.js";
import { badRequest, forbidden, ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rateLimit.js";
import { expectObject, optionalString, requireString, requireUuid, ValidationError } from "../lib/validate.js";

// Handler principal : POST /update-staff — modification d'un accès personnel par le directeur.
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
    if (userId === caller.id) {
      return badRequest(res, "Modifiez votre propre profil depuis votre page de profil.");
    }

    const { data: target, error: targetError } = await svc
      .from("profiles")
      .select("id, school_id, role, email, first_name, last_name, teacher_id")
      .eq("id", userId)
      .maybeSingle();
    if (targetError || !target || target.school_id !== caller.schoolId) {
      return ok(res, { error: "Compte introuvable dans votre école." }, 404);
    }
    if (target.role === "directeur") {
      return badRequest(res, "Le compte directeur ne peut être modifié qu'au niveau du support.");
    }
    if (!isStaffRole(target.role)) {
      return badRequest(res, "Seuls les comptes du personnel peuvent être modifiés ici.");
    }

    const firstName = optionalString(body, "firstName", "Le prénom", 60);
    const lastName = optionalString(body, "lastName", "Le nom", 60);
    const email = optionalString(body, "email", "L'e-mail", 120)?.toLowerCase();
    const phone = optionalString(body, "phone", "Le téléphone", 20);
    const specialties = requireStringArrayOptional(body);

    if (email && !EMAIL_RE.test(email)) {
      return badRequest(res, "Adresse e-mail invalide.");
    }
    // Même exigence qu'à la création (createStaffAccount) : un numéro
    // invalide ne doit pas pouvoir être introduit via la mise à jour.
    if (phone && !SN_PHONE_RE.test(phone.replace(/\s+/g, " "))) {
      return badRequest(res, "Le téléphone est invalide (format sénégalais attendu).");
    }

    if (email && email !== (target.email ?? "").toLowerCase()) {
      const { error: emailError } = await svc.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
      });
      if (emailError) {
        if (/already|exists|registered|duplicate/i.test(emailError.message ?? "")) {
          return badRequest(res, "Un compte existe déjà avec cet e-mail.");
        }
        return badRequest(res, "Impossible de changer l'e-mail de ce compte. Vérifiez qu'il n'est pas déjà utilisé.");
      }
    }

    const patch = {};
    if (firstName !== undefined) patch.first_name = firstName;
    if (lastName !== undefined) patch.last_name = lastName;
    if (email !== undefined) patch.email = email;
    if (phone !== undefined) patch.phone = phone;
    if (Object.keys(patch).length) {
      const { error } = await svc.from("profiles").update(patch).eq("id", userId);
      if (error) {
        // Rollback Auth : si l'e-mail a déjà été changé côté Auth mais que la
        // mise à jour de profiles échoue, l'agent ne pourrait plus se
        // connecter avec l'adresse affichée (Auth ≠ profiles/teachers).
        if (email && email !== (target.email ?? "").toLowerCase()) {
          const { error: revertError } = await svc.auth.admin.updateUserById(userId, {
            email: (target.email ?? "").toLowerCase(),
            email_confirm: true,
          });
          if (revertError) logError("update-staff:revert-email", revertError);
        }
        logError("update-staff", error);
        return serverError(res);
      }
    }

    if (target.teacher_id && (firstName !== undefined || lastName !== undefined || email !== undefined || phone !== undefined)) {
      const teacherPatch = {};
      if (firstName !== undefined) teacherPatch.first_name = firstName;
      if (lastName !== undefined) teacherPatch.last_name = lastName;
      if (email !== undefined) teacherPatch.email = email;
      if (phone !== undefined) teacherPatch.phone = phone;
      const { error } = await svc.from("teachers").update(teacherPatch).eq("id", target.teacher_id);
      if (error) {
        logError("update-staff", error);
        return serverError(res);
      }
    }

    if (target.teacher_id && specialties !== undefined) {
      const { error } = await svc.from("teachers").update({ specialties }).eq("id", target.teacher_id);
      if (error) {
        logError("update-staff", error);
        return serverError(res);
      }
    }

    await audit(svc, {
      schoolId: caller.schoolId,
      actorId: caller.id,
      actorRole: caller.role,
      action: "staff_updated",
      entity: "profiles",
      entityId: userId,
      payload: { fields: Object.keys({ ...patch, specialties }) },
    });

    return ok(res, { updated: true });
  } catch (e) {
    if (e?.name === "ValidationError") return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return badRequest(res, e.message);
    logError("update-staff", e);
    return serverError(res);
  }
});

/** Lit les spécialités en mise à jour : undefined si le champ est absent. */
function requireStringArrayOptional(body) {
  const raw = body["specialties"];
  if (raw === undefined) return undefined;
  // Borne identique à requireStringArray (validate.js) : un tableau illimité
  // permettrait d'injecter des centaines d'éléments dans la ligne teachers.
  if (
    !Array.isArray(raw) ||
    raw.length > 20 ||
    raw.some((v) => typeof v !== "string" || v.length > 80)
  ) {
    throw new ValidationError("Les spécialités sont invalides (20 éléments maximum, 80 caractères par élément).");
  }
  return raw.map((v) => v.trim()).filter(Boolean);
}
