import { SCHOOL_YEAR } from "@/data/school";
import { supabase } from "@/lib/supabase";
import { callFunction } from "@/lib/functions";

/**
 * Le schéma réellement déployé sur Supabase utilise `timetables` + `timetable_courses`
 * (et non `timetable_slots`).
 *
 * LECTURES : via Supabase/PostgREST (protégées par la RLS — les policies
 * SELECT sont scopées par école).
 * ÉCRITURES : via l'API backend sécurisée (/api/timetables — JWT vérifié,
 * rôle direction, school_id du profil, rate-limit, validations métier
 * dont l'anti-chevauchement). Ne jamais réintroduire d'écriture directe
 * ici : elle contournerait ces gardes.
 */

export interface TimetableClassRef {
  name: string | null;
  levels?: { label: string | null } | { label: string | null }[] | null;
}

export interface Timetable {
  id: string;
  school_id: string;
  name: string;
  class_id: string;
  school_year: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  class_rooms?: TimetableClassRef | null;
  timetable_courses?: { id: string }[] | null;
}

export interface TimetableCourse {
  id: string;
  timetable_id: string;
  subject_id: string;
  teacher_id: string;
  day: string;
  start_time: string;
  end_time: string;
  room: string | null;
  description: string | null;
  subjects?: { name: string | null } | { name: string | null }[] | null;
  teachers?: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
}

export interface CreateTimetableInput {
  name: string;
  classId: string;
  schoolYear?: string;
}

export interface TimetableSubjectOption {
  id: string;
  name: string;
}

export interface TimetableTeacherOption {
  id: string;
  first_name: string;
  last_name: string;
}

export interface CourseInput {
  subjectId: string;
  teacherId: string;
  /** Jour en minuscules : lundi … samedi (contrainte de la base). */
  day: string;
  /** Heure au format HH:MM. */
  startTime: string;
  /** Heure au format HH:MM. */
  endTime: string;
  room?: string;
  description?: string;
}

const TIMETABLE_SELECT =
  "id, school_id, name, class_id, school_year, status, created_by, created_at, updated_at, published_at, class_rooms(name, levels(label))";

/** PostgREST renvoie tantôt un objet, tantôt un tableau pour une relation imbriquée. */
function first<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

// Nom de la matière d'un cours, avec texte de repli si elle manque.
export function courseSubject(course: TimetableCourse): string {
  return first(course.subjects)?.name ?? "Matière non spécifiée";
}

// Nom complet de l'enseignant d'un cours, avec texte de repli si absent.
export function courseTeacher(course: TimetableCourse): string {
  const teacher = first(course.teachers);
  const name = `${teacher?.first_name ?? ""} ${teacher?.last_name ?? ""}`.trim();
  return name || "Enseignant non assigné";
}

// Libellé de la classe d'un emploi du temps (« CM2 · Primaire » ou équivalent).
export function timetableClassLabel(timetable: Timetable): string {
  const room = timetable.class_rooms;
  const level = first(room?.levels)?.label ?? null;
  if (room?.name && level) return `${room.name} · ${level}`;
  return room?.name ?? level ?? "Classe non spécifiée";
}

// Nombre de cours rattachés à un emploi du temps.
export function timetableCourseCount(timetable: Timetable): number {
  return timetable.timetable_courses?.length ?? 0;
}

// Tous les emplois du temps d'une école (table timetables), le plus récent d'abord.
export async function listTimetables(schoolId: string): Promise<Timetable[]> {
  const { data, error } = await supabase
    .from("timetables")
    .select(`${TIMETABLE_SELECT}, timetable_courses(id)`)
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as Timetable[];
}

// Un emploi du temps et ses cours (timetable_courses), chargés en parallèle.
export async function getTimetable(timetableId: string): Promise<{ timetable: Timetable; courses: TimetableCourse[] }> {
  const [{ data: timetable, error: timetableError }, { data: courses, error: coursesError }] = await Promise.all([
    supabase.from("timetables").select(TIMETABLE_SELECT).eq("id", timetableId).single(),
    supabase
      .from("timetable_courses")
      .select("*, subjects(name), teachers(first_name, last_name)")
      .eq("timetable_id", timetableId)
      .order("start_time"),
  ]);

  if (timetableError) throw timetableError;
  if (coursesError) throw coursesError;

  return {
    timetable: timetable as unknown as Timetable,
    courses: (courses ?? []) as unknown as TimetableCourse[],
  };
}

// Matières de l'école (options pour remplir un cours).
export async function listTimetableSubjects(schoolId: string): Promise<TimetableSubjectOption[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("school_id", schoolId)
    .order("name");

  if (error) throw error;
  return (data ?? []) as TimetableSubjectOption[];
}

// Enseignants de l'école (options pour remplir un cours).
export async function listTimetableTeachers(schoolId: string): Promise<TimetableTeacherOption[]> {
  const { data, error } = await supabase
    .from("teachers")
    .select("id, first_name, last_name")
    .eq("school_id", schoolId)
    .order("last_name");

  if (error) throw error;
  return (data ?? []) as TimetableTeacherOption[];
}

/**
 * La table `timetable_courses` exige un enseignant. Tant que l'école n'en a
 * aucun, on crée (une seule fois) un enseignant « à définir » pour permettre
 * au directeur de remplir la maquette. Il pourra être remplacé plus tard.
 */
export async function ensurePlaceholderTeacher(schoolId: string): Promise<string> {
  const email = `enseignant-a-definir+${schoolId}@classora.local`;

  const find = async (): Promise<string | null> => {
    const { data, error } = await supabase
      .from("teachers")
      .select("id")
      .eq("school_id", schoolId)
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  };

  const existing = await find();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("teachers")
    .insert({
      school_id: schoolId,
      kind: "professeur",
      first_name: "Enseignant",
      last_name: "à définir",
      email,
      phone: "",
      specialties: [],
    })
    .select("id")
    .single();

  if (error) {
    // Course possible entre deux enregistrements : on relit la ligne créée.
    const retry = await find();
    if (retry) return retry;
    throw error;
  }

  return (data as { id: string }).id;
}

// Crée un emploi du temps en brouillon pour une classe (API sécurisée).
export async function createTimetable(input: CreateTimetableInput, schoolId: string, actorId: string): Promise<string> {
  void schoolId;
  void actorId; // school_id et created_by viennent du profil côté serveur.
  const result = await callFunction<{ timetable: { id: string } }>("api/timetables", {
    classId: input.classId,
    name: input.name,
    schoolYear: input.schoolYear?.trim() || SCHOOL_YEAR,
  });
  return result.timetable.id;
}

// Publie un emploi du temps (visible par la classe) — API sécurisée.
export async function publishTimetable(timetableId: string, schoolId: string): Promise<void> {
  void schoolId;
  await callFunction(`api/timetables/${timetableId}/publish`, {});
}

// Repasse un emploi du temps en brouillon (le dépublie) — API sécurisée.
export async function unpublishTimetable(timetableId: string, schoolId: string): Promise<void> {
  void schoolId;
  await callFunction(`api/timetables/${timetableId}/unpublish`, {});
}

// Ajoute un cours (matière, enseignant, jour, horaires) à un emploi du temps — API sécurisée.
export async function createCourse(timetableId: string, schoolId: string, input: CourseInput): Promise<void> {
  void schoolId;
  await callFunction(`api/timetables/${timetableId}/slots`, {
    subjectId: input.subjectId,
    teacherId: input.teacherId,
    day: input.day,
    startTime: input.startTime,
    endTime: input.endTime,
    room: input.room?.trim() || null,
    description: input.description?.trim() || null,
  });
}

// Modifie un cours existant (table timetable_courses) — API sécurisée.
export async function updateCourse(courseId: string, schoolId: string, input: CourseInput): Promise<void> {
  void schoolId;
  // La route exige l'id de l'emploi du temps parent : on le retrouve via la
  // lecture RLS puis on passe par l'API (qui re-vérifie l'appartenance).
  const { data, error } = await supabase
    .from("timetable_courses")
    .select("timetable_id")
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw error;
  const timetableId = (data as { timetable_id: string } | null)?.timetable_id;
  if (!timetableId) throw new Error("Cours introuvable.");
  await callFunction(`api/timetables/${timetableId}/slots/${courseId}`, {
    subjectId: input.subjectId,
    teacherId: input.teacherId,
    day: input.day,
    startTime: input.startTime,
    endTime: input.endTime,
    room: input.room?.trim() || null,
    description: input.description?.trim() || null,
  }, "PATCH");
}

// Supprime un cours d'un emploi du temps — API sécurisée.
export async function deleteCourse(courseId: string, schoolId: string): Promise<void> {
  void schoolId;
  const { data, error } = await supabase
    .from("timetable_courses")
    .select("timetable_id")
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw error;
  const timetableId = (data as { timetable_id: string } | null)?.timetable_id;
  if (!timetableId) throw new Error("Cours introuvable.");
  await callFunction(`api/timetables/${timetableId}/slots/${courseId}`, undefined, "DELETE");
}

// Supprime définitivement un emploi du temps (et ses cours, par cascade côté base) — API sécurisée.
export async function deleteTimetable(timetableId: string, schoolId: string): Promise<void> {
  void schoolId;
  await callFunction(`api/timetables/${timetableId}`, undefined, "DELETE");
}
