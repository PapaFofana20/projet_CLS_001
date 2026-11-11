/**
 * Inscription publique d'un PARENT : le code élève rattache le compte à un
 * élève de CETTE école (RPC finish_parent_registration : demande
 * d'approbation, pré-validation du code enfant). Résolution de l'école :
 * uuid OU matricule.
 */

import { passwordError, serviceClient } from "../lib/auth.js";
import { badRequest, ok, route, serverError, RATE_LIMIT_RE, logError, withTimeout } from "../lib/http.js";
import { readPlatformSettings } from "../lib/platformSettings.js";
import { enforceRateLimit, clientIp } from "../lib/rateLimit.js";
import { expectObject, optionalString, optionalUuid, requireEmail, requireSnPhone, requireString } from "../lib/validate.js";

// Handler principal : POST /register-parent — inscription publique d'un parent.
export default route(async (req, res) => {
  if (req.method !== "POST") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    await enforceRateLimit(svc, `register-parent:${clientIp(req) ?? "sans-adresse"}`, 10, 300);

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
    const studentMatricule = requireString(body, "studentMatricule", "Le matricule de l'élève", { min: 4, max: 20 }).toUpperCase();
    const password = requireString(body, "password", "Le mot de passe", { min: 8, max: 72, trim: false });

    let resolvedSchool = null;
    if (schoolId) {
      const { data } = await svc.from("schools").select("id").eq("id", schoolId).maybeSingle();
      resolvedSchool = data?.id ?? null;
    } else if (matricule) {
      // eq() : le matricule/code sont normalisés en majuscules côté client ;
      // ilike() laisserait % et _ agir comme jokers (balayage d'écoles/codes).
      const { data: sch } = await svc.from("schools").select("id").eq("matricule", matricule).maybeSingle();
      resolvedSchool = sch?.id ?? null;
      if (resolvedSchool) {
        // Pré-validation du matricule élève de l'école (message identique au front).
        const { data: child } = await svc
          .from("students")
          .select("id")
          .eq("school_id", resolvedSchool)
          .eq("matricule", studentMatricule)
          .maybeSingle();
        if (!child) {
          return badRequest(res, "Matricule élève introuvable dans cette école. Vérifiez le matricule reçu auprès de l'école.");
        }
      }
    }
    if (!resolvedSchool) return badRequest(res, "École introuvable.");

    // Vérifier que l'école est writable (abonnement actif) — garde-fous
    // identique à registerStudent. Une école expirée ne doit pas pouvoir
    // recevoir de nouvelles inscriptions parents. Fail-closed : toute
    // erreur RPC ou réponse non-true bloque.
    const { data: writable, error: writableError } = await svc.rpc("school_is_writable", { p_school_id: resolvedSchool });
    if (writableError || writable !== true) {
      return badRequest(res, "L'abonnement de cette école n'est pas actif.");
    }

    // Vérifier le plafond de demandes EN_ATTENTE (max 100 par école)
    const { count, error: countError } = await svc
      .from("registration_requests")
      .select("*", { count: "exact", head: true })
      .eq("school_id", resolvedSchool)
      .eq("status", "EN_ATTENTE");
    if (countError) logError("register-parent", countError);
    if (count && count >= 100) {
      return badRequest(res, "Trop de demandes en attente pour cette école (limite 100).");
    }

    const pwError = passwordError(password);
    if (pwError) return badRequest(res, pwError);

    const { data: created, error: createError } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "parent", school_id: resolvedSchool },
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
        svc.rpc("finish_parent_registration", {
          p_user_id: created.user.id,
          p_school_id: resolvedSchool,
          p_first_name: firstName,
          p_last_name: lastName,
          p_phone: phone,
          p_email: email,
          p_student_matricule: studentMatricule,
        }),
        15_000,
        "finish_parent_registration"
      );
      if (error || !data) throw new Error(error?.message ?? "Inscription incomplète.");
      const result = data;
      return ok(res, {
        user: {
          id: created.user.id,
          email,
          firstName,
          lastName,
          role: "parent",
          status: result.approved ? "ACTIF" : "EN_ATTENTE",
        },
        requestId: result.request_id,
        approved: result.approved,
        childName: result.child_name,
      });
    } catch (sqlError) {
      await svc.auth.admin.deleteUser(created.user.id);
      const message = sqlError instanceof Error ? sqlError.message : undefined;
      if (message && /un compte existe déjà|matricule élève|école|inscriptions/i.test(message)) {
        return badRequest(res, message);
      }
      logError("register-parent", sqlError);
      return serverError(res);
    }
  } catch (e) {
    if (e?.name === "ValidationError") return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return badRequest(res, e.message);
    logError("register-parent", e);
    return serverError(res);
  }
});
