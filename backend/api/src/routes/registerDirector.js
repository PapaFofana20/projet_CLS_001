/**
 * Inscription publique d'un DIRECTEUR (3 étapes atomiques) :
 *  1. création du compte Auth (échec rapide si l'e-mail est déjà pris) ;
 *  2. une seule RPC security definer transactionnelle : école, paramètres,
 *     frais par niveau, matières par défaut, profil ACTIF + abonnement :
 *     année de découverte offerte UNIQUEMENT si la formule est gratuite
 *     (prix 0) ; sinon abonnement expiré à la création (migration 00051),
 *     activation requise via la demande d'activation du support.
 *  3. nettoyage du compte Auth si l'étape 2 échoue (pas d'état fantôme).
 * Pas de matricule manuel : l'écran suivant est le tableau de bord.
 */

import { passwordError, serviceClient } from "../lib/auth.js";
import { badRequest, ok, route, serverError, RATE_LIMIT_RE, logError, withTimeout } from "../lib/http.js";
import { readPlatformSettings } from "../lib/platformSettings.js";
import { enforceRateLimit, clientIp } from "../lib/rateLimit.js";
import { expectObject, optionalString, requireCycles, requireEmail, requireSnPhone, requireString } from "../lib/validate.js";

// Handler principal : POST /register-director — inscription publique d'un directeur et de son école.
export default route(async (req, res) => {
  if (req.method !== "POST") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    await enforceRateLimit(svc, `register-director:${clientIp(req) ?? "sans-adresse"}`, 5, 300);

    // Réglages plateforme : la maintenance et la fermeture des inscriptions
    // bloquent réellement la création de nouveaux établissements.
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
    const firstName = requireString(body, "firstName", "Le prénom", { min: 1, max: 60 });
    const lastName = requireString(body, "lastName", "Le nom", { min: 1, max: 60 });
    const email = requireEmail(body);
    const phone = requireSnPhone(body, "phone", "Le téléphone");
    const password = requireString(body, "password", "Le mot de passe", { min: 8, max: 72, trim: false });
    const schoolName = requireString(body, "schoolName", "Le nom de l'école", { min: 2, max: 120 });
    const city = requireString(body, "city", "La ville", { min: 1, max: 80 });
    // p_address (migration 00023) : l'Edge Function la transmettait, la route
    // Express la perdait silencieusement — l'adresse de l'école n'était jamais
    // enregistrée à l'inscription.
    const address = optionalString(body, "address", "L'adresse", 200) ?? "";
    const cycles = requireCycles(body);
    // Formule choisie sur la page d'inscription (Découverte ou Premium) et
    // activée immédiatement par la RPC pour un an (migration 00035).
    const rawPlan = optionalString(body, "plan", "Le plan d'abonnement", 50) ?? "essentiel";
    const ALLOWED_PLANS = new Set(["essentiel", "premium"]);
    if (!ALLOWED_PLANS.has(rawPlan)) {
      return badRequest(res, "Formule d'abonnement invalide.");
    }
    const plan = rawPlan;

    const pwError = passwordError(password);
    if (pwError) return badRequest(res, pwError);

    // 1. Compte Auth (l'e-mail en double est renvoyé avec le message du front).
    const { data: created, error: createError } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "directeur", school_id: null },
    });
    if (createError || !created?.user) {
      const duplicate = /already|duplicate|registered/i.test(createError?.message ?? "");
      return badRequest(
        res,
        duplicate ? "Un compte existe déjà avec cet e-mail." : "Impossible de créer le compte. Réessayez.",
      );
    }

    // 2. Écritures transactionnelles côté SQL.
    try {
      const args = {
        p_user_id: created.user.id,
        p_first_name: firstName,
        p_last_name: lastName,
        p_phone: phone,
        p_email: email,
        p_school_name: schoolName,
        p_city: city,
        p_address: address,
        p_cycles: cycles,
      };
      let { data, error } = await withTimeout(
        svc.rpc("finish_director_registration", { ...args, p_plan_id: plan }),
        15_000,
        "finish_director_registration"
      );
      // Compatibilité descendante : avant la migration 00032, la fonction
      // n'exposait que 9 arguments et PostgREST renvoyait PGRST202/PGRST203
      // (« function not found »), ce qui faisait échouer toute inscription en
      // 500. On rejoue alors sans la formule au lieu de perdre le compte.
      if (error && /PGRST20[23]|could not find the function/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
        console.warn("[register-director] RPC à 9 arguments (migration 00032 non appliquée)");
        ({ data, error } = await svc.rpc("finish_director_registration", args));
      }
      if (error || !data) {
        throw new Error(error?.message ?? "Inscription incomplète.");
      }

      // 3. L'école n'existe qu'après la RPC : le « school_id » du JWT était
      //    donc null à la création du compte. On le renseigne maintenant,
      //    sinon current_school_id() ne peut s'appuyer que sur le repli
      //    « lecture du profil » à chaque contrôle RLS.
      const { error: metaError } = await svc.auth.admin.updateUserById(created.user.id, {
        app_metadata: { role: "directeur", school_id: data },
      });
      if (metaError) {
        // L'inscription reste valide : le repli sur public.profiles couvre ce cas.
        console.warn("[register-director] app_metadata non mis à jour :", metaError.message);
      }

      return ok(res, {
        schoolId: data,
        email,
        message: "Compte créé. Connectez-vous pour ouvrir votre session.",
      });
    } catch (sqlError) {
      // 4. Nettoyage : le compte Auth ne doit pas survivre sans école/profil.
      await svc.auth.admin.deleteUser(created.user.id);
      const message = sqlError instanceof Error ? sqlError.message : undefined;
      if (message && /un compte existe déjà/i.test(message)) return badRequest(res, message);
      logError("register-director", sqlError);
      return serverError(res);
    }
  } catch (e) {
    if (e?.name === "ValidationError") return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return badRequest(res, e.message);
    logError("register-director", e);
    return serverError(res);
  }
});
