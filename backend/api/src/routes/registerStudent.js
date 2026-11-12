/**
 * Inscription publique d'un ÉLÈVE : compte Auth EN_ATTENTE, transaction RPC
 * finish_student_registration (demande d'approbation + matricule élève si
 * approuvé automatiquement). Résolution de l'école : uuid OU matricule.
 */

import { passwordError, serviceClient } from "../lib/auth.js";
import { badRequest, ok, route, serverError, RATE_LIMIT_RE, logError, withTimeout } from "../lib/http.js";
import { readPlatformSettings } from "../lib/platformSettings.js";
import { enforceRateLimit, clientIp } from "../lib/rateLimit.js";
import { expectObject, optionalIsoDate, optionalString, optionalUuid, requireEmail, requireSnPhone, requireString } from "../lib/validate.js";

// Handler principal : POST /register-student — inscription publique d'un élève.
export default route(async (req, res) => {
  if (req.method !== "POST") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    await enforceRateLimit(svc, `register-student:${clientIp(req) ?? "sans-adresse"}`, 10, 300);

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
    const firstName = requireString(body, "firstName", "Le prénom", { min: 1, max: 60 });
    const lastName = requireString(body, "lastName", "Le nom", { min: 1, max: 60 });
    const email = requireEmail(body);
    const phone = requireSnPhone(body, "phone", "Le téléphone");
    const gender = body["gender"] === "M" ? "M" : body["gender"] === "F" ? "F" : undefined;
    const birthDate = optionalIsoDate(body, "birthDate", "La date de naissance");
    const classId = optionalUuid(body, "classId", "La classe");
    const password = requireString(body, "password", "Le mot de passe", { min: 8, max: 72, trim: false });

    if (gender === undefined && body["gender"] !== undefined && body["gender"] !== "") {
      return badRequest(res, "Le sexe est invalide.");
    }

    // Résolution de l'école : uuid fourni OU matricule public.
    // eq() : le matricule est normalisé en majuscules ; ilike() laisserait %
    // et _ agir comme jokers (balayage des écoles).
    let resolvedSchool = null;
    if (schoolId) {
      const { data } = await svc.from("schools").select("id").eq("id", schoolId).maybeSingle();
      resolvedSchool = data?.id ?? null;
    } else if (matricule) {
      const { data } = await svc.from("schools").select("id").eq("matricule", matricule).maybeSingle();
      resolvedSchool = data?.id ?? null;
    }
    if (!resolvedSchool) return badRequest(res, "École introuvable.");
    if (!classId) return badRequest(res, "Sélectionnez une classe.");

    // Vérifier que l'école est writable (abonnement actif) — fail-closed :
    // toute erreur RPC ou réponse non-true bloque l'inscription.
    const { data: writable, error: writableError } = await svc.rpc("school_is_writable", { p_school_id: resolvedSchool });
    if (writableError || writable !== true) return badRequest(res, "L'abonnement de cette école n'est pas actif.");

    // Vérifier le plafond de demandes EN_ATTENTE (max 100 par école)
    const { count, error: countError } = await svc
      .from("registration_requests")
      .select("*", { count: "exact", head: true })
      .eq("school_id", resolvedSchool)
      .eq("status", "EN_ATTENTE");
    if (countError) logError("register-student", countError);
    if (count && count >= 100) return badRequest(res, "Trop de demandes en attente pour cette école (limite 100).");

    const pwError = passwordError(password);
    if (pwError) return badRequest(res, pwError);

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
      const { data, error } = await withTimeout(
        svc.rpc("finish_student_registration", {
          p_user_id: created.user.id,
          p_school_id: resolvedSchool,
          p_first_name: firstName,
          p_last_name: lastName,
          p_phone: phone,
          p_email: email,
          p_gender: gender ?? null,
          p_birth_date: birthDate ?? null,
          p_class_id: classId,
        }),
        15_000,
        "finish_student_registration"
      );
      if (error || !data) throw new Error(error?.message ?? "Inscription incomplète.");
      const result = data;
      return ok(res, {
        user: {
          id: created.user.id,
          email,
          firstName,
          lastName,
          role: "eleve",
          status: result.approved ? "ACTIF" : "EN_ATTENTE",
        },
        requestId: result.request_id,
        approved: result.approved,
      });
    } catch (sqlError) {
      // Le compte Auth ne doit pas survivre sans demande/profil.
      await svc.auth.admin.deleteUser(created.user.id);
      const message = sqlError instanceof Error ? sqlError.message : undefined;
      if (message && /un compte existe déjà|classe|école|inscriptions/i.test(message)) {
        return badRequest(res, message);
      }
      logError("register-student", sqlError);
      return serverError(res);
    }
  } catch (e) {
    if (e?.name === "ValidationError") return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return badRequest(res, e.message);
    logError("register-student", e);
    return serverError(res);
  }
});
