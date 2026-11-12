/**
 * Création du compte d'un élève DÉJÀ INSCRIT par la direction, à partir de
 * son matricule d'élève unique (ex. EC260001).
 * Le compte est rattaché à la fiche inscrite (ACTIF immédiatement) : le
 * matricule ne sert qu'à cette identification à la création. La connexion
 * reste matricule d'école + e-mail + mot de passe.
 * school_id peut être transmis en uuid ou via le matricule public de l'école.
 * Route publique, rate limitée par IP.
 */

import { passwordError, serviceClient } from "../lib/auth.js";
import { badRequest, ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { readPlatformSettings } from "../lib/platformSettings.js";
import { enforceRateLimit, clientIp } from "../lib/rateLimit.js";
import { expectObject, optionalIsoDate, optionalString, optionalUuid, requireEmail, requireSnPhone, requireString } from "../lib/validate.js";

// Handler principal : POST /register-enrolled-student — compte d'un élève déjà inscrit.
export default route(async (req, res) => {
  if (req.method !== "POST") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    await enforceRateLimit(svc, `register-enrolled-student:${clientIp(req) ?? "sans-adresse"}`, 10, 300);

    // Réglages plateforme : maintenance / fermeture des inscriptions.
    const platform = await readPlatformSettings(svc);
    if (platform.settings.maintenanceMode) {
      return badRequest(
        res,
        platform.settings.maintenanceMessage ||
          "La plateforme est en maintenance. Les inscriptions rouvriront très prochainement.",
      );
    }
    if (!platform.settings.registrationOpen) {
      return badRequest(res, "Les inscriptions sont momentanément fermées. Contactez le support Classora.");
    }

    const body = expectObject(req.body);
    const schoolId = optionalUuid(body, "schoolId", "L'école");
    const matricule = optionalString(body, "matricule", "Le matricule de l'école", 10)?.toUpperCase();
    const studentMatricule = requireString(body, "studentMatricule", "Le matricule de l'élève", { min: 4, max: 20 });
    const birthDate = optionalIsoDate(body, "birthDate", "La date de naissance");
    if (!birthDate) return badRequest(res, "La date de naissance est requise pour créer ce compte.");
    const email = requireEmail(body);
    const phone = requireSnPhone(body, "phone", "Le téléphone");
    const password = requireString(body, "password", "Le mot de passe", { min: 8, max: 128, trim: false });

    const pwError = passwordError(password);
    if (pwError) return badRequest(res, pwError);

    // Résolution de l'école : uuid fourni OU matricule public.
    let resolvedSchool = null;
    if (schoolId) {
      const { data } = await svc.from("schools").select("id").eq("id", schoolId).maybeSingle();
      resolvedSchool = data?.id ?? null;
    } else if (matricule) {
      const { data } = await svc.from("schools").select("id").eq("matricule", matricule).maybeSingle();
      resolvedSchool = data?.id ?? null;
    }
    if (!resolvedSchool) return badRequest(res, "École introuvable.");

    // Garde d'abonnement fail-closed (la RPC est aussi vérifiée côté SQL).
    const { data: writable, error: writableError } = await svc.rpc("school_is_writable", { p_school_id: resolvedSchool });
    if (writableError || writable !== true) {
      return badRequest(res, "L'abonnement de cette école n'est pas actif.");
    }

    const { data: created, error: createError } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "eleve", school_id: resolvedSchool },
    });
    if (createError || !created?.user) {
      const duplicate = /already|duplicate|registered/i.test(createError?.message ?? "");
      return badRequest(
        res,
        duplicate ? "Un compte existe déjà avec cet e-mail." : "Impossible de créer le compte. Réessayez.",
      );
    }

    try {
      const { data, error } = await svc.rpc("finish_enrolled_student_registration", {
        p_user_id: created.user.id,
        p_school_id: resolvedSchool,
        p_student_matricule: studentMatricule.trim().toUpperCase(),
        p_birth_date: birthDate,
        p_email: email,
        p_phone: phone,
      });
      if (error || !data) throw new Error(error?.message ?? "Création incomplète.");
      const result = data;
      return ok(res, {
        user: {
          id: created.user.id,
          email,
          firstName: result.first_name,
          lastName: result.last_name,
          role: "eleve",
          status: "ACTIF",
        },
        studentId: result.student_id,
        studentMatricule: result.student_matricule,
      });
    } catch (sqlError) {
      // Le compte Auth ne doit pas survivre sans fiche élève.
      await svc.auth.admin.deleteUser(created.user.id);
      const message = sqlError instanceof Error ? sqlError.message : undefined;
      if (message && /matricule|compte|école|identité|abonnement|naissance/i.test(message)) {
        return badRequest(res, message);
      }
      logError("register-enrolled-student", sqlError);
      return serverError(res);
    }
  } catch (e) {
    if (e?.name === "ValidationError") return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return badRequest(res, e.message);
    logError("register-enrolled-student", e);
    return serverError(res);
  }
});
