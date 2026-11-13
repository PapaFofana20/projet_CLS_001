import type { ClassRoom, ClassSubject, Cycle, Level, School, SchoolSettings, Subject } from "@/types";
import { levels } from "@/data/school";
import { supabase } from "@/lib/supabase";
import { callFunction } from "@/lib/functions";
import { classSubjectsOf, classesOf, db, hydrate, respond, schoolOf, settingsOf, studentsOf } from "./db";

// École : réglages, matricule, classes, matières et coefficients (schools, class_rooms, subjects…).

export interface SchoolOverview {
  levels: Level[];
  classes: ClassRoom[];
  subjects: Subject[];
  classSubjects: ClassSubject[];
  settings: SchoolSettings;
  school: School | null;
}

/**
 * Écrit une ligne unique SANS `upsert`.
 *
 * PostgREST traduit un upsert en `INSERT ... ON CONFLICT (...) DO UPDATE SET`
 * en incluant TOUTES les colonnes envoyées — y compris celles de la clé
 * (school_id, level_id…). Or `authenticated` ne possède qu'un grant UPDATE
 * par colonne sur `level_fees` (inscription, mensualite) et `class_subjects`
 * (coefficient) : l'upsert échouait donc avec « permission denied for table ».
 * On fait ici un UPDATE ciblé, puis un INSERT si aucune ligne n'existait.
 */
async function updateOrInsert(
  table: "level_fees" | "class_subjects",
  match: Record<string, string>,
  values: Record<string, number>,
  echo: string,
): Promise<string | null> {
  let update = supabase.from(table).update(values);
  for (const [column, value] of Object.entries(match)) update = update.eq(column, value);
  const { data, error } = await update.select(echo);
  if (error) return error.message;
  if (data && data.length > 0) return null;
  const row = { ...match, ...values } as Record<string, string | number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await supabase.from(table).insert(row as any);
  return insertError?.message ?? null;
}

// Vue d'ensemble d'une école (niveaux, classes, matières, réglages) depuis le cache.
export const getSchoolOverview = (schoolId: string): Promise<SchoolOverview> =>
  (async () => {
    const settings = settingsOf(schoolId);
    return { levels, classes: classesOf(schoolId), subjects: subjectsOfCached(schoolId), classSubjects: classSubjectsOf(schoolId), settings, school: schoolOf(schoolId) ?? null };
  })();

function subjectsOfCached(schoolId: string): Subject[] {
  return db.subjects.filter((s) => s.schoolId === schoolId);
}

// Toutes les écoles du cache (liste publique ou admin).
export const listSchools = (): Promise<School[]> => respond(() => db.schools);

// Une l'école par son id, ou null si elle n'est pas dans le cache.
export const getSchool = (schoolId: string): Promise<School | null> => respond(() => schoolOf(schoolId) ?? null);

// Met à jour les réglages, les frais et l'identité de l'école (plusieurs tables).
export function updateSettings(schoolId: string, patch: Partial<SchoolSettings>): Promise<SchoolSettings> {
  return (async () => {
    const settingsPatch: Record<string, unknown> = {};
    if (patch.schoolYear !== undefined) settingsPatch.school_year = patch.schoolYear;
    if (patch.periodType !== undefined) settingsPatch.period_type = patch.periodType;
    if (patch.currentPeriod !== undefined) settingsPatch.current_period = patch.currentPeriod;
    if (patch.annexFees !== undefined) settingsPatch.annex_fees = patch.annexFees;
    if (patch.siblingDiscount !== undefined) settingsPatch.sibling_discount = patch.siblingDiscount;
    if (patch.blockStudentBulletins !== undefined) settingsPatch.block_student_bulletins = patch.blockStudentBulletins;
    if (Object.keys(settingsPatch).length > 0) {
      // `.select()` permet de détecter une mise à jour qui ne touche aucune
      // ligne : sans lui, Supabase renvoyait « succès » et l'interface affichait
      // des valeurs jamais enregistrées (RLS en lecture seule, ligne absente).
      const { data, error } = await supabase
        .from("school_settings")
        .update(settingsPatch)
        .eq("school_id", schoolId)
        .select("school_id");
      if (error) throw new Error(/read-only|row-level/i.test(error.message) ? "Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées." : error.message);
      if (!data || data.length === 0) throw new Error("Réglages introuvables pour cette école : aucune modification n'a été enregistrée.");
    }
    if (patch.fees !== undefined) {
      const currentFees = settingsOf(schoolId).fees;
      for (const [levelId, fee] of Object.entries(patch.fees)) {
        const next = {
          inscription: Math.max(0, Math.round(Number(fee.inscription) || 0)),
          mensualite: Math.max(0, Math.round(Number(fee.mensualite) || 0)),
        };
        const before = currentFees[levelId];
        // Tarif inchangé : inutile d'écrire (et d'attendre un aller-retour).
        if (before && before.inscription === next.inscription && before.mensualite === next.mensualite) continue;
        const message = await updateOrInsert("level_fees", { school_id: schoolId, level_id: levelId }, next, "level_id");
        if (message) throw new Error(/read-only|row-level/i.test(message) ? "Frais non modifiables : l'abonnement de votre école n'autorise plus les modifications." : `Frais non enregistrés : ${message}`);
      }
    }
    const schoolPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) schoolPatch.name = patch.name;
    if (patch.address !== undefined) schoolPatch.address = patch.address;
    if (patch.phone !== undefined) schoolPatch.phone = patch.phone;
    if (patch.email !== undefined) schoolPatch.email = patch.email;
    if (patch.cycles !== undefined) schoolPatch.cycles = patch.cycles;
    if (Object.keys(schoolPatch).length > 0) {
      const { data, error } = await supabase.from("schools").update(schoolPatch).eq("id", schoolId).select("id");
      if (error) throw new Error(/row-level/i.test(error.message) ? "L'identité de l'école est modifiable par la direction uniquement." : error.message);
      if (!data || data.length === 0) throw new Error("École introuvable : aucune modification n'a été enregistrée.");
    }
    await hydrate("settings");
    return settingsOf(schoolId);
  })();
}

/* ------------------------------------------------------------------ */
/* Matricule d'école                                                    */
/* ------------------------------------------------------------------ */

export interface MatriculeCheck {
  ok: boolean;
  school?: School;
  /** Motif du refus, null si le matricule est valide. */
  reason: "introuvable" | "inscriptions_fermees" | "abonnement_expire" | "abonnement_bloque" | "format" | null;
  message: string | null;
}

interface MatriculeServerSchool {
  id: string;
  name: string;
  city?: string;
  logo_url?: string | null;
  cycles?: Cycle[];
  registration_open?: boolean;
  auto_approve_students?: boolean;
}

/** Vérification via l'API (rate-limitée par IP) — le RPC n'est plus exposé à anon. */
export async function verifyMatricule(raw: string): Promise<MatriculeCheck> {
  // Nettoie le code saisi (espaces, tirets et 0/O confondues) avant l'envoi à l'API.
  const code = raw.trim().toUpperCase().replace(/[\s-]/g, "").replace(/[01OI]/g, "");
  let result: { ok: boolean; reason: string | null; message: string | null; school?: MatriculeServerSchool };
  try {
    result = await callFunction<typeof result>("verify-matricule", { matricule: code }, "POST");
  } catch (e) {
    const err = new Error(e instanceof Error ? e.message : "Vérification impossible, réessayez.");
    (err as Error & { cause?: unknown }).cause = e;
    throw err;
  }
  if (result.school) {
    const s = result.school;
    const school: School = {
      id: s.id,
      name: s.name,
      matricule: code,
      city: s.city ?? "",
      address: "",
      phone: "",
      email: "",
      logoUrl: s.logo_url ?? undefined,
      cycles: s.cycles ?? [],
      registrationOpen: s.registration_open ?? false,
      autoApproveStudents: s.auto_approve_students ?? false,
      createdAt: "",
    };
    return { ok: result.ok, school, reason: (result.reason as MatriculeCheck["reason"]) ?? null, message: result.message };
  }
  return { ok: result.ok, reason: (result.reason as MatriculeCheck["reason"]) ?? null, message: result.message };
}

/** Matricule attribué au premier paiement confirmé (renvoie l'école à jour). */
export function generateMatriculeFor(schoolId: string): Promise<School> {
  return (async () => {
    await hydrate("schools");
    const school = schoolOf(schoolId);
    if (!school) throw new Error("École introuvable.");
    return school;
  })();
}

/** Interrupteur du directeur : ouvre ou ferme les inscriptions (le matricule ne change pas). */
export function toggleRegistration(schoolId: string, open: boolean): Promise<School> {
  return (async () => {
    const { error } = await supabase.from("schools").update({ registration_open: open }).eq("id", schoolId);
    if (error) throw new Error(/row-level/i.test(error.message) ? "Seule la direction modifie l'école." : error.message);
    await hydrate("schools");
    const school = schoolOf(schoolId);
    if (!school) throw new Error("École introuvable.");
    return school;
  })();
}

/** Option des paramètres : approbation automatique des élèves (désactivée par défaut). */
export function setAutoApprove(schoolId: string, value: boolean): Promise<School> {
  return (async () => {
    const { error } = await supabase.from("schools").update({ auto_approve_students: value }).eq("id", schoolId);
    if (error) throw new Error(/row-level/i.test(error.message) ? "Seule la direction modifie l'école." : error.message);
    await hydrate("schools");
    const school = schoolOf(schoolId);
    if (!school) throw new Error("École introuvable.");
    return school;
  })();
}

// Met à jour les infos administratives d'une école (nom, ville, contacts, cycles).
export function updateSchool(schoolId: string, patch: Partial<Pick<School, "name" | "city" | "address" | "phone" | "email" | "cycles">>): Promise<School> {
  return (async () => {
    const body: Record<string, unknown> = {};
    for (const k of ["name", "city", "address", "phone", "email", "cycles"] as const) {
      if (patch[k] !== undefined) body[k] = patch[k];
    }
    const { error } = await supabase.from("schools").update(body).eq("id", schoolId);
    if (error) throw new Error(/row-level/i.test(error.message) ? "L'identité de l'école est modifiable par la direction uniquement." : error.message);
    await Promise.all([hydrate("schools"), hydrate("settings")]);
    const school = schoolOf(schoolId);
    if (!school) throw new Error("École introuvable.");
    return school;
  })();
}

/* ------------------------------------------------------------------ */
/* Classes, matières, coefficients                                      */
/* ------------------------------------------------------------------ */

// Ajoute ou modifie le coefficient d'une matière pour une classe (ou la retire si null).
export function setClassSubject(schoolId: string, classId: string, subjectId: string, coefficient: number | null): Promise<ClassSubject[]> {
  return (async () => {
    const cls = classesOf(schoolId).find((c) => c.id === classId);
    if (!cls) throw new Error("Classe introuvable.");
    if (coefficient === null) {
      const { error } = await supabase
        .from("class_subjects")
        .delete()
        .eq("school_id", schoolId)
        .eq("class_id", classId)
        .eq("subject_id", subjectId);
      if (error) throw new Error(/read-only|row-level/i.test(error.message) ? "Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées." : error.message);
    } else {
      const existing = classSubjectsOf(schoolId).find((x) => x.classId === classId && x.subjectId === subjectId);
      const { error } = existing
        ? await supabase
            .from("class_subjects")
            .update({ coefficient })
            .eq("school_id", schoolId)
            .eq("class_id", classId)
            .eq("subject_id", subjectId)
        : await supabase
            .from("class_subjects")
            .insert({ school_id: schoolId, class_id: classId, subject_id: subjectId, coefficient });
      if (error) throw new Error(/read-only|row-level/i.test(error.message) ? "Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées." : error.message);
      // Règle élémentaire : le titulaire reçoit automatiquement la nouvelle matière.
      if (!existing && cls.cycle === "elementaire" && cls.headTeacherId) {
        const { error: assignError } = await supabase.from("teaching_assignments").insert({
          school_id: schoolId,
          teacher_id: cls.headTeacherId,
          class_id: classId,
          subject_id: subjectId,
        });
        if (assignError) throw new Error(/read-only|row-level/i.test(assignError.message) ? "Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées." : assignError.message);
      }
    }
    await Promise.all([hydrate("classSubjects"), hydrate("assignments")]);
    return classSubjectsOf(schoolId).filter((x) => x.classId === classId);
  })();
}

// Crée une nouvelle matière pour l'école (table subjects).
export function addSubject(schoolId: string, name: string, cycles: Cycle[]): Promise<Subject> {
  return (async () => {
    if (subjectsOfCached(schoolId).some((s) => s.name.toLowerCase() === name.trim().toLowerCase())) throw new Error("Cette matière existe déjà.");
    const { error } = await supabase
      .from("subjects")
      .insert({
        school_id: schoolId,
        name: name.trim(),
        cycles,
      });
    if (error) {
      if (/read-only|row-level/i.test(error.message)) throw new Error("Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées.");
      if (/duplicate|unique/i.test(error.message)) throw new Error("Cette matière existe déjà.");
      throw new Error(error.message);
    }
    await hydrate("subjects");
    const subject = subjectsOfCached(schoolId).find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
    if (!subject) throw new Error("Matière introuvable après création.");
    return subject;
  })();
}

export interface NewClassInput {
  levelId: string;
  section: string;
  series?: string;
  capacity: number;
}

// Crée une classe et copie les coefficients d'une classe du même niveau.
export function createClass(schoolId: string, input: NewClassInput): Promise<ClassRoom> {
  return (async () => {
    const level = levels.find((l) => l.id === input.levelId);
    if (!level) throw new Error("Niveau introuvable.");
    const name = `${level.label === "Terminale" ? "Tle" : level.label}${input.series ? " " + input.series : " " + input.section.toUpperCase()}`;
    if (classesOf(schoolId).some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error(`La classe « ${name} » existe déjà.`);
    const { error } = await supabase
      .from("class_rooms")
      .insert({
        school_id: schoolId,
        level_id: level.id,
        name,
        cycle: level.cycle,
        ...(input.series ? { series: input.series } : {}),
        capacity: input.capacity,
      });
    if (error) {
      if (/read-only|row-level/i.test(error.message)) throw new Error("Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées.");
      if (/duplicate|unique/i.test(error.message)) throw new Error(`La classe « ${name} » existe déjà.`);
      throw new Error(error.message);
    }
    await hydrate("classes");
    const cls = classesOf(schoolId).find((c) => c.name === name);
    if (!cls) throw new Error("Classe introuvable après création.");
    // Copie des coefficients d'une classe référente (comportement du front).
    const template =
      classesOf(schoolId).find((c) => c.levelId === level.id && c.series === cls.series) ??
      classesOf(schoolId).find((c) => c.cycle === level.cycle);
    if (template && cls.id !== template.id) {
      for (const cs of classSubjectsOf(schoolId).filter((x) => x.classId === template.id)) {
        // La classe vient d'être créée : ses lignes n'existent pas encore, un
        // simple INSERT suffit (l'upsert échouait sur les grants par colonne).
        const { error: copyError } = await supabase.from("class_subjects").insert({
          school_id: schoolId,
          class_id: cls.id,
          subject_id: cs.subjectId,
          coefficient: cs.coefficient,
        });
        if (copyError) throw new Error(/read-only|row-level/i.test(copyError.message) ? "Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées." : copyError.message);
      }
      await hydrate("classSubjects");
    }
    return cls;
  })();
}

// Supprime une classe vide (refuse si des élèves y sont encore inscrits).
export function deleteClass(schoolId: string, classId: string): Promise<void> {
  return (async () => {
    if (studentsOf(schoolId).some((s) => s.classId === classId)) throw new Error("Impossible de supprimer une classe qui contient des élèves.");
    const { error: assignmentsError } = await supabase.from("teaching_assignments").delete().eq("school_id", schoolId).eq("class_id", classId);
    if (assignmentsError) throw new Error("Impossible de nettoyer les affectations de la classe. Réessayez.");
    const { error: subjectsError } = await supabase.from("class_subjects").delete().eq("school_id", schoolId).eq("class_id", classId);
    if (subjectsError) throw new Error("Impossible de nettoyer les matières de la classe. Réessayez.");
    const { error } = await supabase.from("class_rooms").delete().eq("id", classId).eq("school_id", schoolId);
    if (error) throw new Error(/guard|élèves/.test(error.message) ? "Impossible de supprimer une classe qui contient des élèves." : /read-only|row-level/i.test(error.message) ? "Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées." : error.message);
    await Promise.all([hydrate("classes"), hydrate("classSubjects"), hydrate("assignments")]);
  })();
}

// Change la capacité d'une classe (refuse si l'effectif actuel est supérieur).
export function updateClassCapacity(schoolId: string, classId: string, capacity: number): Promise<void> {
  return (async () => {
    const { error } = await supabase.from("class_rooms").update({ capacity }).eq("id", classId).eq("school_id", schoolId);
    if (error) throw new Error(/Capacité|capacity|déjà/i.test(error.message) ? `La classe contient déjà ${studentsOf(schoolId).filter((s) => s.classId === classId).length} élèves.` : /read-only|row-level/i.test(error.message) ? "Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées." : error.message);
    await hydrate("classes");
  })();
}

/* ------------------------------------------------------------------ */
/* Classes ouvertes à l'inscription (utilisé par /inscription)          */
/* ------------------------------------------------------------------ */

export interface OpenClass {
  id: string;
  name: string;
  cycle: Cycle;
  levelLabel: string;
  capacity: number;
  filled: number;
}

/** Classes ouvertes pour le formulaire public (RPC appelable par anon). */
export const openClassesFor = (schoolId: string): Promise<OpenClass[]> =>
  (async () => {
    const { data, error } = await supabase.rpc("open_classes", { p_school_id: schoolId });
    if (error) return [];
    const rows = (data ?? []) as { class_id: string; name: string; cycle: Cycle; level_label: string; capacity: number; filled: number }[];
    return rows
      .map((r) => ({ id: r.class_id, name: r.name, cycle: r.cycle, levelLabel: r.level_label, capacity: r.capacity, filled: r.filled }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
  })();
