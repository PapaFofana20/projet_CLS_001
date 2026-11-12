/**
 * Gestion des emplois du temps — routes SÉCURISÉES (vague 1 de l'audit).
 *
 * Avant l'audit : aucun contrôle d'accès (client service_role à nu), filtre
 * `schoolId` optionnel, `req.user` inexistant (crash sur POST) et messages
 * d'erreur SQL fuit au client. Les 4 corrections sont appliquées ici :
 *   1. AUTH : JWT vérifié via getCallerProfile (comme les autres routes) ;
 *      lecture = tout compte ACTIF rattaché à une école, écriture = direction
 *      uniquement ;
 *   2. SCOPE : le school_id vient TOUJOURS du profil de l'appelant — jamais du
 *      query/body. Chaque accès par id vérifie l'appartenance à l'école ;
 *   3. VALIDATION : UUID, listes blanches, horaires ; à l'insertion d'un
 *      rendez-vous, subject_id / teacher_id / class_id doivent tous appartenir
 *      à l'école (la RLS est contournée par le client service_role, la
 *      garde est donc explicite ici) ;
 *   4. ERREURS : messages SQL « loggé » côté serveur seulement, réponse
 *      générique au client.
 *
 * Note : la route console générique (`/api/timetables` sans id) est limitée à
 * la direction aussi — plus aucun listage inter-écoles possible.
 */

import { expectObject, optionalString, requireString, requireUuid } from "../lib/validate.js";
import { badRequest, forbidden, notFound, ok, route, unauthorized, serverError, logError } from "../lib/http.js";
import { getCallerProfile, schoolIsWritable, serviceClient } from "../lib/auth.js";
import { enforceRateLimit } from "../lib/rateLimit.js";

const DAYS = new Set(["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const YEAR_RE = /^20\d{2}-20\d{2}$/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Profil appelant : compte ACTIF rattaché à une école (ou null → réponse déjà envoyée). */
async function resolveCaller(svc, req, res) {
  const caller = await getCallerProfile(svc, req);
  if (!caller) {
    unauthorized(res);
    return null;
  }
  if (caller.status !== "ACTIF") {
    forbidden(res, "Ce compte n'est plus actif. Contactez la direction de votre école.");
    return null;
  }
  if (caller.mustChangePassword) {
    forbidden(res, "Changez votre mot de passe temporaire avant de continuer.");
    return null;
  }
  if (!caller.schoolId) {
    forbidden(res, "Aucune école n'est rattachée à votre compte.");
    return null;
  }
  return caller;
}

// Handler principal : /api/timetables — emplois du temps de l'école de l'appelant (lecture et écriture direction).
export default route(async (req, res) => {
  const svc = serviceClient();
  const caller = await resolveCaller(svc, req, res);
  if (!caller) return;

  const writing = req.method !== "GET";
  if (writing && caller.role !== "directeur") {
    return forbidden(res, "Seule la direction peut modifier les emplois du temps.");
  }

  // Rate limit : clé par utilisateur (comme les autres routes privilégiées).
  await enforceRateLimit(svc, `timetables:${caller.id}`, writing ? 60 : 180, 300);

  const id = req.params.id;

  // Les chemins /slots/* sont gérés par les handlers dédiés plus bas :
  // jamais interceptés par les handlers d'élément (GET/PATCH/DELETE :id).
  const isSlotPath = req.path.includes("/slots");

  /* ---------------------------------------------------------------- */
  /* COLLECTION : /api/timetables                                      */
  /* ---------------------------------------------------------------- */
  if (!id) {
    if (req.method === "GET") {
      // Listage STRICTEMENT limité à l'école de l'appelant.
      const { data, error } = await svc
        .from("timetables")
        .select()
        .eq("school_id", caller.schoolId)
        .order("created_at", { ascending: false });
      if (error) {
        logError("timetables:GET list", error);
        return serverError(res);
      }
      return ok(res, { timetables: data });
    }
    if (req.method === "POST") {
      if (!(await schoolIsWritable(svc, caller.schoolId))) {
        return forbidden(res, "Mode lecture seule : l'abonnement de votre école est expiré.");
      }
      const body = expectObject(req.body);
      const classId = requireUuid(body, "classId", "La classe");
      const name = optionalString(body, "name", "Le nom", 80);
      const schoolYear = optionalString(body, "schoolYear", "L'année scolaire", 9);
      if (schoolYear && !YEAR_RE.test(schoolYear)) {
        return badRequest(res, "Format d'année scolaire attendu : 2026-2027.");
      }
      // La classe DOIT appartenir à l'école de la direction.
      const { data: cls } = await svc
        .from("class_rooms")
        .select("id")
        .eq("id", classId)
        .eq("school_id", caller.schoolId)
        .maybeSingle();
      if (!cls) return notFound(res, "Classe introuvable dans votre école.");

      const { data, error } = await svc
        .from("timetables")
        .insert({
          school_id: caller.schoolId, // jamais du client
          class_id: classId,
          name: name ?? "Emploi du temps",
          school_year: schoolYear ?? "2026-2027",
          status: "draft",
          created_by: caller.id,
        })
        .select()
        .single();
      if (error) {
        logError("timetables:POST", error);
        return serverError(res);
      }
      return ok(res, { timetable: data }, 201);
    }
    return notFound(res);
  }

  /* ---------------------------------------------------------------- */
  /* ÉLÉMENT : /api/timetables/:id (uuid)                              */
  /* ---------------------------------------------------------------- */
  if (!UUID_RE.test(id)) return notFound(res);

  if (req.method === "GET" && !isSlotPath) {
    const { data, error } = await svc
      .from("timetables")
      .select("*")
      .eq("id", id)
      .eq("school_id", caller.schoolId) // appartenance forcée
      .maybeSingle();
    if (error || !data) return notFound(res);
    return ok(res, { timetable: data });
  }

  if (req.method === "PATCH" && !isSlotPath) {
    if (!(await schoolIsWritable(svc, caller.schoolId))) {
      return forbidden(res, "Mode lecture seule : l'abonnement de votre école est expiré.");
    }
    const body = expectObject(req.body);
    const name = optionalString(body, "name", "Le nom", 80);
    const schoolYear = optionalString(body, "schoolYear", "L'année scolaire", 9);
    if (schoolYear && !YEAR_RE.test(schoolYear)) {
      return badRequest(res, "Format d'année scolaire attendu : 2026-2027.");
    }
    const patch = {};
    if (name) patch.name = name;
    if (schoolYear) patch.school_year = schoolYear;
    if (Object.keys(patch).length === 0) {
      return badRequest(res, "Aucune modification transmise.");
    }
    const { data, error } = await svc
      .from("timetables")
      .update(patch)
      .eq("id", id)
      .eq("school_id", caller.schoolId)
      .select()
      .single();
    if (error || !data) return notFound(res);
    return ok(res, { timetable: data });
  }

  if (req.method === "DELETE" && !isSlotPath) {
    if (!(await schoolIsWritable(svc, caller.schoolId))) {
      return forbidden(res, "Mode lecture seule : l'abonnement de votre école est expiré.");
    }
    const { error } = await svc
      .from("timetables")
      .delete()
      .eq("id", id)
      .eq("school_id", caller.schoolId);
    if (error) {
      logError("timetables:DELETE", error);
      return serverError(res);
    }
    return ok(res, { deleted: true });
  }

  /* ---------------------------------------------------------------- */
  /* PUBLICATION : POST /api/timetables/:id/publish                    */
  /* ---------------------------------------------------------------- */
  if (req.method === "POST" && req.path === `/api/timetables/${id}/publish`) {
    if (!(await schoolIsWritable(svc, caller.schoolId))) {
      return forbidden(res, "Mode lecture seule : l'abonnement de votre école est expiré.");
    }
    const { data, error } = await svc
      .from("timetables")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", id)
      .eq("school_id", caller.schoolId)
      .select()
      .single();
    if (error || !data) return notFound(res);
    return ok(res, { timetable: data });
  }

  /* ---------------------------------------------------------------- */
  /* DÉPUBLICATION : POST /api/timetables/:id/unpublish                 */
  /* ---------------------------------------------------------------- */
  if (req.method === "POST" && req.path === `/api/timetables/${id}/unpublish`) {
    if (!(await schoolIsWritable(svc, caller.schoolId))) {
      return forbidden(res, "Mode lecture seule : l'abonnement de votre école est expiré.");
    }
    const { data, error } = await svc
      .from("timetables")
      .update({ status: "draft", published_at: null })
      .eq("id", id)
      .eq("school_id", caller.schoolId)
      .select()
      .single();
    if (error || !data) return notFound(res);
    return ok(res, { timetable: data });
  }

  /* ---------------------------------------------------------------- */
  /* COURS : GET /api/timetables/:id/slots                              */
  /* ---------------------------------------------------------------- */
  if (req.method === "GET" && (req.route?.path?.endsWith("/slots") || req.path.includes("/slots"))) {
    const { data: tt } = await svc
      .from("timetables")
      .select("id")
      .eq("id", id)
      .eq("school_id", caller.schoolId)
      .maybeSingle();
    if (!tt) return notFound(res, "Emploi du temps introuvable dans votre école.");
    const { data, error } = await svc
      .from("timetable_courses")
      .select("*")
      .eq("timetable_id", id)
      .order("day")
      .order("start_time");
    if (error) {
      logError("timetables:GET slots", error);
      return serverError(res);
    }
    return ok(res, { courses: data });
  }

  /* ---------------------------------------------------------------- */
  /* RENDEZ-VOUS : POST /api/timetables/:id/slots                      */
  /* ---------------------------------------------------------------- */
  if (req.method === "POST" && (req.route?.path?.endsWith("/slots") || req.path.includes("/slots"))) {
    if (!(await schoolIsWritable(svc, caller.schoolId))) {
      return forbidden(res, "Mode lecture seule : l'abonnement de votre école est expiré.");
    }
    const body = expectObject(req.body);
    const subjectId = requireUuid(body, "subjectId", "La matière");
    const teacherId = requireUuid(body, "teacherId", "L'enseignant");
    const day = requireString(body, "day", "Le jour", { min: 2, max: 12 }).toLowerCase();
    const startTime = requireString(body, "startTime", "L'heure de début", { min: 4, max: 8 });
    const endTime = requireString(body, "endTime", "L'heure de fin", { min: 4, max: 8 });
    const room = optionalString(body, "room", "La salle", 40);
    const description = optionalString(body, "description", "La description", 400);

    if (!DAYS.has(day)) return badRequest(res, "Jour invalide (lundi à samedi).");
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      return badRequest(res, "Format d'heure attendu : 08:00.");
    }
    if (endTime <= startTime) {
      return badRequest(res, "L'heure de fin doit être postérieure à l'heure de début.");
    }

    // L'emploi du temps et ses référentiels doivent appartenir à l'école.
    const { data: tt } = await svc
      .from("timetables")
      .select("id")
      .eq("id", id)
      .eq("school_id", caller.schoolId)
      .maybeSingle();
    if (!tt) return notFound(res, "Emploi du temps introuvable dans votre école.");

    const { data: subject } = await svc
      .from("subjects")
      .select("id")
      .eq("id", subjectId)
      .eq("school_id", caller.schoolId)
      .maybeSingle();
    if (!subject) return notFound(res, "Matière introuvable dans votre école.");

    const { data: teacher } = await svc
      .from("teachers")
      .select("id")
      .eq("id", teacherId)
      .eq("school_id", caller.schoolId)
      .maybeSingle();
    if (!teacher) return notFound(res, "Enseignant introuvable dans votre école.");

    // Chevauchement : même emploi du temps, même jour, même enseignant —
    // un enseignant ne peut pas avoir deux cours au même créneau.
    const { data: overlap } = await svc
      .from("timetable_courses")
      .select("id")
      .eq("timetable_id", id)
      .eq("teacher_id", teacherId)
      .eq("day", day)
      .lt("start_time", endTime)
      .gt("end_time", startTime)
      .limit(1)
      .maybeSingle();
    if (overlap) {
      return badRequest(res, "Cet enseignant a déjà un cours qui chevauche ce créneau le même jour.");
    }

    const { data, error } = await svc
      .from("timetable_courses")
      .insert({
        timetable_id: id,
        subject_id: subjectId,
        teacher_id: teacherId,
        day,
        start_time: startTime,
        end_time: endTime,
        room: room ?? null,
        description: description ?? null,
      })
      .select()
      .single();
    if (error) {
      logError("timetables:POST slots", error);
      return serverError(res);
    }
    return ok(res, { course: data }, 201);
  }

  /* ---------------------------------------------------------------- */
  /* COURS : PATCH / DELETE /api/timetables/:id/slots/:slotId           */
  /* ---------------------------------------------------------------- */
  const slotId = req.params.slotId;
  if ((req.method === "PATCH" || req.method === "DELETE") && slotId && UUID_RE.test(slotId)) {
    if (!(await schoolIsWritable(svc, caller.schoolId))) {
      return forbidden(res, "Mode lecture seule : l'abonnement de votre école est expiré.");
    }
    // Le cours doit appartenir à un emploi du temps de l'école de l'appelant.
    const { data: course } = await svc
      .from("timetable_courses")
      .select("id, timetable_id")
      .eq("id", slotId)
      .eq("timetable_id", id)
      .maybeSingle();
    if (!course) return notFound(res, "Cours introuvable dans votre école.");
    const { data: tt } = await svc
      .from("timetables")
      .select("id")
      .eq("id", id)
      .eq("school_id", caller.schoolId)
      .maybeSingle();
    if (!tt) return notFound(res, "Emploi du temps introuvable dans votre école.");

    if (req.method === "DELETE") {
      const { error } = await svc.from("timetable_courses").delete().eq("id", slotId);
      if (error) {
        logError("timetables:DELETE slot", error);
        return serverError(res);
      }
      return ok(res, { deleted: true });
    }

    const body = expectObject(req.body);
    const subjectId = requireUuid(body, "subjectId", "La matière");
    const teacherId = requireUuid(body, "teacherId", "L'enseignant");
    const day = requireString(body, "day", "Le jour", { min: 2, max: 12 }).toLowerCase();
    const startTime = requireString(body, "startTime", "L'heure de début", { min: 4, max: 8 });
    const endTime = requireString(body, "endTime", "L'heure de fin", { min: 4, max: 8 });
    const room = optionalString(body, "room", "La salle", 40);
    const description = optionalString(body, "description", "La description", 400);

    if (!DAYS.has(day)) return badRequest(res, "Jour invalide (lundi à samedi).");
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      return badRequest(res, "Format d'heure attendu : 08:00.");
    }
    if (endTime <= startTime) {
      return badRequest(res, "L'heure de fin doit être postérieure à l'heure de début.");
    }

    const { data: subject } = await svc
      .from("subjects")
      .select("id")
      .eq("id", subjectId)
      .eq("school_id", caller.schoolId)
      .maybeSingle();
    if (!subject) return notFound(res, "Matière introuvable dans votre école.");

    const { data: teacher } = await svc
      .from("teachers")
      .select("id")
      .eq("id", teacherId)
      .eq("school_id", caller.schoolId)
      .maybeSingle();
    if (!teacher) return notFound(res, "Enseignant introuvable dans votre école.");

    // Chevauchement (hors le cours lui-même).
    const { data: overlap } = await svc
      .from("timetable_courses")
      .select("id")
      .eq("timetable_id", id)
      .eq("teacher_id", teacherId)
      .eq("day", day)
      .lt("start_time", endTime)
      .gt("end_time", startTime)
      .neq("id", slotId)
      .limit(1)
      .maybeSingle();
    if (overlap) {
      return badRequest(res, "Cet enseignant a déjà un cours qui chevauche ce créneau le même jour.");
    }

    const { data, error } = await svc
      .from("timetable_courses")
      .update({
        subject_id: subjectId,
        teacher_id: teacherId,
        day,
        start_time: startTime,
        end_time: endTime,
        room: room ?? null,
        description: description ?? null,
      })
      .eq("id", slotId)
      .select()
      .single();
    if (error || !data) {
      logError("timetables:PATCH slot", error);
      return serverError(res);
    }
    return ok(res, { course: data });
  }

  return notFound(res);
});
