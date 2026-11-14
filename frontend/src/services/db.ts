import type {
  AbsenceRecord,
  ClassRoom,
  ClassSubject,
  Cycle,
  Grade,
  Parent,
  Payment,
  ReportMeta,
  School,
  SchoolRegistrationRequest,
  SchoolSettings,
  Student,
  Subject,
  Subscription,
  Teacher,
  TeachingAssignment,
  User,
} from "@/types";
import { supabase } from "@/lib/supabase";

/**
 * Cache de référence de l'école, hydraté depuis Supabase sous les politiques
 * RLS : chaque tableau est rempli avec ce que LE rôle de la session est
 * autorisé à lire (fonction hydrate). Les lectures de l'interface passent par
 * les helpers `xOf(schoolId)` exactement comme avant ; les écritures passent
 * par les RPCs du back-end puis re-hydratent l'entité concernée.
 * Chaque map*() convertit une ligne Supabase (snake_case) en type front (camelCase).
 */

export interface Database {
  schools: School[];
  subscriptions: Subscription[];
  registrationRequests: SchoolRegistrationRequest[];
  users: User[];
  teachers: Teacher[];
  parents: Parent[];
  students: Student[];
  classes: ClassRoom[];
  subjects: Subject[];
  classSubjects: ClassSubject[];
  assignments: TeachingAssignment[];
  grades: Grade[];
  reportMetas: ReportMeta[];
  payments: Payment[];
  absences: AbsenceRecord[];
  settings: SchoolSettings[];
}

/** « Base de données » locale de la session (cache, jamais persistée ici). */
export const db: Database = {
  schools: [],
  subscriptions: [],
  registrationRequests: [],
  users: [],
  teachers: [],
  parents: [],
  students: [],
  classes: [],
  subjects: [],
  classSubjects: [],
  assignments: [],
  grades: [],
  reportMetas: [],
  payments: [],
  absences: [],
  settings: [],
};

function replace(tableName: keyof Database, rows: unknown[]): void {
  (db[tableName] as unknown[]).splice(0, (db[tableName] as unknown[]).length, ...rows);
}

const iso = (v: string | null): string => v ?? "";
const date = (v: string | null): string => v ?? "";

function mapSchool(r: any): School {
  return {
    id: r.id,
    name: r.name,
    matricule: r.matricule ?? "",
    city: r.city ?? "",
    address: r.address ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    logoUrl: r.logo_url ?? undefined,
    cycles: (r.cycles ?? []) as Cycle[],
    registrationOpen: r.registration_open ?? true,
    autoApproveStudents: r.auto_approve_students ?? false,
    createdAt: iso(r.created_at).slice(0, 10),
  };
}

function mapSettings(r: any): SchoolSettings {
  return {
    schoolId: r.school_id,
    name: r.name,
    address: r.address ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    schoolYear: r.school_year,
    cycles: (r.cycles ?? []) as Cycle[],
    periodType: r.period_type ?? "semestre",
    currentPeriod: r.current_period ?? "S1",
    fees: r.fees ?? {},
    annexFees: r.annex_fees ?? { cantine: 0, transport: 0, tenue: 0 },
    siblingDiscount: r.sibling_discount ?? 0,
    blockStudentBulletins: r.block_student_bulletins ?? false,
  };
}

function mapSubscription(r: any): Subscription {
  const endsAt = r.ends_at ? String(r.ends_at).slice(0, 10) : null;
  const today = new Date().toISOString().slice(0, 10);
  let status: Subscription["status"] = "AUCUN";
  if (endsAt) {
    // EXPIRE si l'échéance est passée, EXPIRE_BIENTOT dans les 7 jours, sinon ACTIF.
    const diffDays = Math.ceil((new Date(endsAt).getTime() - new Date(today).getTime()) / 86_400_000);
    status = endsAt < today ? "EXPIRE" : diffDays <= 7 ? "EXPIRE_BIENTOT" : "ACTIF";
  }
  return {
    id: r.id,
    schoolId: r.school_id,
    plan: r.plan_id,
    status,
    startsAt: date(r.starts_at),
    endsAt: date(r.ends_at),
    studentLimit: r.student_limit ?? null,
    amountPaid: r.amount_paid ?? 0,
    paymentRef: r.payment_ref ?? "",
    method: r.method ?? undefined,
    paidAt: r.paid_at ? String(r.paid_at).slice(0, 16) : "",
  };
}

function mapTeacher(r: any): Teacher {
  return {
    schoolId: r.school_id,
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    kind: r.kind,
    email: r.email,
    phone: r.phone ?? "",
    specialties: r.specialties ?? [],
  };
}

function mapParent(r: any): Parent {
  return {
    schoolId: r.school_id,
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone ?? "",
    email: r.email,
    address: r.address ?? "",
  };
}

function mapStudent(r: any): Student {
  return {
    schoolId: r.school_id,
    id: r.id,
    matricule: r.matricule,
    childCode: r.child_code,
    firstName: r.first_name,
    lastName: r.last_name,
    gender: r.gender,
    birthDate: r.birth_date ?? "",
    classId: r.class_id,
    parentId: r.parent_id ?? "",
    options: r.options ?? { cantine: false, transport: false, tenue: false },
    enrolledAt: r.enrolled_at ?? "",
  };
}

function mapClass(r: any): ClassRoom {
  return {
    schoolId: r.school_id,
    id: r.id,
    name: r.name,
    levelId: r.level_id,
    cycle: r.cycle,
    series: r.series ?? undefined,
    headTeacherId: r.head_teacher_id ?? null,
    capacity: r.capacity,
  };
}

function mapSubject(r: any): Subject {
  return {
    schoolId: r.school_id,
    id: r.id,
    name: r.name,
    cycles: (r.cycles ?? []) as Cycle[],
  };
}

function mapClassSubject(r: any): ClassSubject {
  return {
    schoolId: r.school_id,
    classId: r.class_id,
    subjectId: r.subject_id,
    coefficient: Number(r.coefficient ?? 1),
  };
}

function mapAssignment(r: any): TeachingAssignment {
  return {
    schoolId: r.school_id,
    teacherId: r.teacher_id,
    classId: r.class_id,
    subjectId: r.subject_id,
  };
}

function mapGrade(r: any): Grade {
  return {
    schoolId: r.school_id,
    studentId: r.student_id,
    classId: r.class_id,
    subjectId: r.subject_id,
    period: r.period,
    devoir1: r.devoir1 === null ? null : Number(r.devoir1),
    devoir2: r.devoir2 === null ? null : Number(r.devoir2),
    composition: r.composition === null ? null : Number(r.composition),
  };
}

function mapReportMeta(r: any): ReportMeta {
  return {
    schoolId: r.school_id,
    studentId: r.student_id,
    period: r.period,
    conduct: r.conduct ?? "Bonne",
    absences: r.absences ?? 0,
    comment: r.comment ?? "",
  };
}

function mapPayment(r: any): Payment {
  return {
    schoolId: r.school_id,
    id: r.id,
    studentId: r.student_id,
    kind: r.kind,
    label: r.label,
    dueDate: r.due_date,
    amount: r.amount,
    paidAmount: r.paid_amount ?? 0,
    status: r.status,
    manualStatus: r.manual_status ?? null,
    method: r.method ?? undefined,
    paidAt: r.paid_at ?? undefined,
    reference: r.reference ?? undefined,
  };
}

function mapRequest(r: any): SchoolRegistrationRequest {
  return {
    id: r.id,
    schoolId: r.school_id,
    userId: r.user_id,
    role: r.role,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone ?? "",
    gender: r.gender ?? undefined,
    birthDate: r.birth_date ?? undefined,
    classId: r.class_id ?? undefined,
    childCode: r.child_code ?? undefined,
    createdAt: iso(r.created_at).slice(0, 10),
    status: r.status,
    decidedAt: r.decided_at ?? undefined,
    reason: r.reason ?? undefined,
  };
}

function mapProfile(r: any): User {
  return {
    id: r.id,
    schoolId: r.school_id,
    email: r.email ?? "",
    passwordHash: "",
    firstName: r.first_name ?? "",
    lastName: r.last_name ?? "",
    phone: r.phone ?? "",
    role: r.role,
    status: r.status,
    mustChangePassword: r.must_change_password ?? false,
    teacherId: r.teacher_id ?? undefined,
    parentId: r.parent_id ?? undefined,
    studentId: r.student_id ?? undefined,
    createdAt: iso(r.created_at),
  };
}

function mapAbsence(r: any): AbsenceRecord {
  return {
    schoolId: r.school_id,
    id: r.id,
    studentId: r.student_id,
    date: r.absence_date,
    type: r.absence_type,
    motif: r.motif ?? "",
    justified: r.justified ?? false,
    subjectId: r.subject_id ?? null,
    recordedBy: r.recorded_by ?? null,
    ...(r.sanction ? { sanction: r.sanction } : {}),
  };
}

const HYDRATION_PAGE_SIZE = 500;
const HYDRATION_MAX_ROWS = 100_000;

/** Échecs d'hydratation depuis la dernière réussite (table → message d'erreur).
 *  Exposés au bandeau HydrationBanner : l'utilisateur ne doit jamais voir des
 *  listes vides SANS savoir qu'un chargement a échoué (réseau, RLS, 500). */
const hydrationFailures = new Map<string, string>();

/** Échecs d'hydratation courants. Sortie : Map table → message (copie). */
export function getHydrationFailures(): Map<string, string> {
  return new Map(hydrationFailures);
}

/** Efface les échecs enregistrés (après une revalidation réussie). */
export function clearHydrationFailures(): void {
  if (hydrationFailures.size) {
    hydrationFailures.clear();
    window.dispatchEvent(new Event("ec:hydration"));
  }
}

async function fetchAllRows(table: string): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += HYDRATION_PAGE_SIZE) {
    const to = from + HYDRATION_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as any[];
    rows.push(...page);
    if (page.length < HYDRATION_PAGE_SIZE) return rows;
    if (rows.length >= HYDRATION_MAX_ROWS) {
      throw new Error(`Plus de ${HYDRATION_MAX_ROWS} lignes à hydrater pour ${table}.`);
    }
  }
}

async function assign(tableName: keyof Database): Promise<void> {
  const table = TABLES[tableName];
  if (!table) return;
  // L'échec est TRACÉ (hydrateAll affiche un bandeau avec bouton Réessayer)
  // puis RELANCÉ : avaler l'erreur faisait croire à un directeur qu'il n'a
  // « aucun élève / aucune note » alors que la table n'avait pas pu être
  // chargée (réseau, RLS, 500). L'appelant décide de la politique.
  try {
    const data = await fetchAllRows(table);
    replace(tableName, data.map(MAPPERS[tableName]));
    hydrationFailures.delete(tableName);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[db] hydratation ${tableName} échouée :`, msg);
    hydrationFailures.set(tableName, msg);
    throw e;
  }
}

const MAPPERS: Record<keyof Database, (r: any) => any> = {
  schools: mapSchool,
  subscriptions: mapSubscription,
  registrationRequests: mapRequest,
  users: mapProfile,
  teachers: mapTeacher,
  parents: mapParent,
  students: mapStudent,
  classes: mapClass,
  subjects: mapSubject,
  classSubjects: mapClassSubject,
  assignments: mapAssignment,
  grades: mapGrade,
  reportMetas: mapReportMeta,
  payments: mapPayment,
  absences: mapAbsence,
  settings: mapSettings,
};

const TABLES: Partial<Record<keyof Database, string>> = {
  schools: "schools",
  subscriptions: "subscriptions",
  registrationRequests: "registration_requests",
  users: "profiles",
  teachers: "teachers",
  parents: "parents",
  students: "students",
  classes: "class_rooms",
  subjects: "subjects",
  classSubjects: "class_subjects",
  assignments: "teaching_assignments",
  grades: "grades",
  reportMetas: "report_metas",
  payments: "payments",
  absences: "absences",
  settings: "school_settings",
};

/** Recharge les paramètres d'école (réunion school_settings + école + frais). */
async function hydrateSettings(): Promise<void> {
  const [settingsRes, feesRes, schoolsRes] = await Promise.all([
    supabase.from("school_settings").select("*"),
    supabase.from("level_fees").select("*"),
    supabase.from("schools").select("*"),
  ]);
  if (settingsRes.error) {
    console.error("[db] hydratation settings refusée :", settingsRes.error.message);
    hydrationFailures.set("settings", settingsRes.error.message);
    window.dispatchEvent(new Event("ec:hydration"));
    return;
  }
  const schools = (schoolsRes.data ?? []) as any[];
  const fees = (feesRes.data ?? []) as any[];
  replace(
    "settings",
    ((settingsRes.data ?? []) as any[]).map((r) => {
      const sc = schools.find((x) => x.id === r.school_id) ?? {};
      const levelFees: Record<string, { inscription: number; mensualite: number }> = {};
      fees.filter((f) => f.school_id === r.school_id).forEach((f) => {
        levelFees[f.level_id] = { inscription: f.inscription, mensualite: f.mensualite };
      });
      return mapSettings({
        ...r,
        name: sc.name ?? "École",
        address: sc.address ?? "",
        phone: sc.phone ?? "",
        email: sc.email ?? "",
        cycles: sc.cycles ?? [],
        fees: levelFees,
      });
    }),
  );
}

// Recharge UNE table (ou une entité spéciale) depuis Supabase vers le cache.
// En cas d'échec : tracé (bandeau) PUIS relancé — l'appelant décide de la
// politique d'affichage, il ne voit plus jamais un échec transformé en liste vide.
export async function hydrate(entity: keyof Database): Promise<void> {
  if (entity === "settings") {
    await hydrateSettings();
    hydrationFailures.delete(entity);
    return;
  }
  return assign(entity);
}

/** Hydrate tout le cache avec ce que le rôle courant peut lire.
 *  allSettled : un échec ne doit pas empêcher le chargement des autres tables.
 *  Les échecs restent tracés (bandeau « Certaines données n'ont pas pu être
 *  chargées ») au lieu de produire des listes vides silencieuses. */
export async function hydrateAll(): Promise<void> {
  const entities: (keyof Database)[] = [
    "schools",
    "subscriptions",
    "registrationRequests",
    "users",
    "teachers",
    "parents",
    "students",
    "classes",
    "subjects",
    "classSubjects",
    "assignments",
    "grades",
    "reportMetas",
    "payments",
    "absences",
    "settings",
  ];
  const results = await Promise.allSettled(entities.map((e) => hydrate(e)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") hydrationFailures.delete(entities[i]);
  });
  // Le bandeau s'abonne à cet événement pour (re)vérifier les échecs.
  window.dispatchEvent(new Event("ec:hydration"));
}

// Vide entièrement le cache local (déconnexion, changement d'école).
export async function clearCache(): Promise<void> {
  (Object.keys(db) as (keyof Database)[]).forEach((k) => {
    (db[k] as unknown[]).splice(0, (db[k] as unknown[]).length);
  });
}

/** Conservé pour la compatibilité des services : l'écriture est côté serveur. */
export function persist(): void {
  window.dispatchEvent(new Event("ec:data"));
}

// Réinitialise le cache puis le recharge depuis Supabase.
export function resetDatabase(): void {
  clearCache().then(() => hydrateAll());
}

// Génère un identifiant unique côté client (utile pour les clés d'affichage).
export function uid(prefix: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  return `${prefix}-${suffix}`;
}

/** Copie défensive du résultat (la persistance est désormais côté serveur). */
export function respond<T>(fn: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      resolve(structuredClone(fn()));
    } catch (e) {
      reject(e instanceof Error ? e : new Error("Erreur inattendue."));
    }
  });
}

/* ------------------------------------------------------------------ */
/* Requêtes de base, systématiquement filtrées par école                */
/* ------------------------------------------------------------------ */

// Helpers de lecture filtrés par école (toujours depuis le cache, jamais un nouvel appel SQL).
export const classesOf = (schoolId: string, limit?: number): ClassRoom[] => {
  const filtered = db.classes.filter((c) => c.schoolId === schoolId);
  return limit ? filtered.slice(0, limit) : filtered;
};
export const studentsOf = (schoolId: string, limit?: number): Student[] => {
  const filtered = db.students.filter((s) => s.schoolId === schoolId);
  return limit ? filtered.slice(0, limit) : filtered;
};
export const teachersOf = (schoolId: string, limit?: number): Teacher[] => {
  const filtered = db.teachers.filter((t) => t.schoolId === schoolId);
  return limit ? filtered.slice(0, limit) : filtered;
};
export const parentsOf = (schoolId: string, limit?: number): Parent[] => {
  const filtered = db.parents.filter((p) => p.schoolId === schoolId);
  return limit ? filtered.slice(0, limit) : filtered;
};
export const subjectsOf = (schoolId: string, limit?: number): Subject[] => {
  const filtered = db.subjects.filter((s) => s.schoolId === schoolId);
  return limit ? filtered.slice(0, limit) : filtered;
};
export const classSubjectsOf = (schoolId: string, limit?: number): ClassSubject[] => {
  const filtered = db.classSubjects.filter((x) => x.schoolId === schoolId);
  return limit ? filtered.slice(0, limit) : filtered;
};
export const assignmentsOf = (schoolId: string, limit?: number): TeachingAssignment[] => {
  const filtered = db.assignments.filter((a) => a.schoolId === schoolId);
  return limit ? filtered.slice(0, limit) : filtered;
};
export const gradesOf = (schoolId: string, limit?: number): Grade[] => {
  const filtered = db.grades.filter((g) => g.schoolId === schoolId);
  return limit ? filtered.slice(0, limit) : filtered;
};
export const reportMetasOf = (schoolId: string, limit?: number): ReportMeta[] => {
  const filtered = db.reportMetas.filter((m) => m.schoolId === schoolId);
  return limit ? filtered.slice(0, limit) : filtered;
};
export const paymentsOf = (schoolId: string, limit?: number): Payment[] => {
  const filtered = db.payments.filter((p) => p.schoolId === schoolId);
  return limit ? filtered.slice(0, limit) : filtered;
};
export const absencesOf = (schoolId: string, limit?: number): AbsenceRecord[] => {
  const filtered = db.absences.filter((a) => a.schoolId === schoolId);
  return limit ? filtered.slice(0, limit) : filtered;
};
export const usersOf = (schoolId: string, limit?: number): User[] => {
  const filtered = db.users.filter((u) => u.schoolId === schoolId);
  return limit ? filtered.slice(0, limit) : filtered;
};
export const schoolOf = (schoolId: string): School | undefined => db.schools.find((s) => s.id === schoolId);
export const settingsOf = (schoolId: string): SchoolSettings =>
  db.settings.find((s) => s.schoolId === schoolId) ?? {
    schoolId,
    name: db.schools.find((s) => s.id === schoolId)?.name ?? "École",
    address: "",
    phone: "",
    email: "",
    schoolYear: "2026-2027",
    cycles: [],
    periodType: "semestre",
    currentPeriod: "S1",
    fees: {},
    annexFees: { cantine: 0, transport: 0, tenue: 0 },
    siblingDiscount: 0,
  };
