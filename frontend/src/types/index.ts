// Types partagés du frontend : écoles, notes, paiements, abonnements et espaces admin.
export type Cycle = "elementaire" | "moyen" | "secondaire";
export type Role = "directeur" | "econome" | "secretaire" | "surveillant" | "instituteur" | "professeur" | "eleve" | "parent";
/** Rôles que seul le directeur peut créer via un accès du personnel. */
export type StaffRole = Extract<Role, "professeur" | "instituteur" | "econome" | "secretaire" | "surveillant">;
/** Cycle de vie d'un compte : en attente de validation par la direction, actif, ou désactivé. */
export type UserStatus = "ACTIF" | "EN_ATTENTE" | "DESACTIVE";
export type PeriodType = "semestre" | "trimestre";
export type PayMethod = "wave" | "orange_money" | "free_money" | "especes";
export type PaymentKind = "inscription" | "mensualite" | "tenue";
export type PaymentStatus = "paye" | "partiel" | "en_retard" | "a_venir";
/** Choix manuel (directeur / économe) sur la fiche élève, par échéance. `a_venir` est le défaut. */
export type ManualPaymentStatus = "a_venir" | "paye" | "impaye";
export type StudentPayStatus = "a_jour" | "partiel" | "impaye";
/** Statuts d'abonnement d'une école. */
export type SubscriptionStatus = "AUCUN" | "ACTIF" | "EXPIRE_BIENTOT" | "EXPIRE";

/* ------------------------------------------------------------------ */
/* Écoles, forfaits, abonnements                                        */
/* ------------------------------------------------------------------ */

export interface School {
  id: string;
  name: string;
  /** Matricule d'école (5 caractères) — vide tant que l'abonnement n'a pas été payé. */
  matricule: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  logoUrl?: string;
  cycles: Cycle[];
  /** Interrupteur du directeur : ferme temporairement les inscriptions. */
  registrationOpen: boolean;
  /** Option des paramètres : approuve automatiquement les inscriptions d'élèves. */
  autoApproveStudents: boolean;
  createdAt: string;
}

export type PlanId = "essentiel" | "pro" | "premium" | "illimite";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Nombre d'élèves actifs maximum — null = illimité. */
  studentLimit: number | null;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  highlight?: boolean;
}

export interface Subscription {
  id: string;
  schoolId: string;
  plan: PlanId;
  status: SubscriptionStatus;
  startsAt: string;
  endsAt: string;
  studentLimit: number | null;
  amountPaid: number;
  paymentRef: string;
  method?: PayMethod;
  paidAt: string;
}

export type RegistrationRequestStatus = "EN_ATTENTE" | "APPROUVEE" | "REFUSEE";

/** Demande d'inscription d'un élève ou d'un parent, en attente de validation par la direction. */
export interface SchoolRegistrationRequest {
  id: string;
  schoolId: string;
  userId: string;
  role: "eleve" | "parent";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender?: "F" | "M";
  birthDate?: string;
  classId?: string;
  /** Code élève communiqué par l'école (demande de type parent). */
  childCode?: string;
  createdAt: string;
  status: RegistrationRequestStatus;
  decidedAt?: string;
  reason?: string;
}

/* ------------------------------------------------------------------ */
/* Données pédagogiques (toutes porteuses de schoolId)                   */
/* ------------------------------------------------------------------ */

export interface Level {
  id: string;
  label: string;
  cycle: Cycle;
  order: number;
  exam?: string;
}

export interface ClassRoom {
  schoolId: string;
  id: string;
  name: string;
  levelId: string;
  cycle: Cycle;
  series?: string;
  /** Instituteur titulaire (élémentaire) ou professeur principal (moyen / secondaire) */
  headTeacherId: string | null;
  capacity: number;
}

export interface Subject {
  schoolId: string;
  id: string;
  name: string;
  cycles: Cycle[];
}

export interface ClassSubject {
  schoolId: string;
  classId: string;
  subjectId: string;
  coefficient: number;
}

export interface Teacher {
  schoolId: string;
  id: string;
  firstName: string;
  lastName: string;
  kind: "instituteur" | "professeur";
  email: string;
  phone: string;
  specialties: string[];
}

export interface TeachingAssignment {
  schoolId: string;
  teacherId: string;
  classId: string;
  subjectId: string;
}

export interface Parent {
  schoolId: string;
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
}

export interface StudentOptions {
  cantine: boolean;
  transport: boolean;
  tenue: boolean;
}

export interface Student {
  schoolId: string;
  id: string;
  matricule: string;
  /** Code à 6 caractères donné par l'école aux familles (rattachement parent). */
  childCode: string;
  firstName: string;
  lastName: string;
  gender: "F" | "M";
  birthDate: string;
  classId: string;
  parentId: string;
  options: StudentOptions;
  enrolledAt: string;
}

export interface Grade {
  schoolId: string;
  studentId: string;
  classId: string;
  subjectId: string;
  period: string;
  devoir1: number | null;
  devoir2: number | null;
  composition: number | null;
}

export interface ReportMeta {
  schoolId: string;
  studentId: string;
  period: string;
  conduct: string;
  absences: number;
  comment: string;
}

export interface Payment {
  schoolId: string;
  id: string;
  studentId: string;
  kind: PaymentKind;
  label: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: PaymentStatus;
  /** Choix manuel posé par la direction / l'économe ; null = calcul automatique. */
  manualStatus?: ManualPaymentStatus | null;
  method?: PayMethod;
  paidAt?: string;
  reference?: string;
}

export interface AbsenceRecord {
  schoolId: string;
  id: string;
  studentId: string;
  date: string;
  type: "absence" | "retard" | "discipline";
  motif: string;
  justified: boolean;
  sanction?: string;
  /** Matière du cours où l'appel a été fait (null = signalement vie scolaire). */
  subjectId?: string | null;
  /** Compte qui a saisi l'absence / le retard. */
  recordedBy?: string | null;
}

/* ------------------------------------------------------------------ */
/* Agents administratifs Classora (interne, hors école)                 */
/* ------------------------------------------------------------------ */

export type AdminAgentRole = "superadmin" | "admin" | "agent_suivi";

export interface AdminAgent {
  id: string;
  matricule: string; // CLA-ADM-000001
  role: AdminAgentRole;
  status: "ACTIF" | "EN_ATTENTE" | "DESACTIVE";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  createdAt: string;
  updatedAt?: string;
}

/* ------------------------------------------------------------------ */
/* Statistiques transversales (admin)                                   */
/* ------------------------------------------------------------------ */

export interface AdminOverviewStats {
  generatedAt: string;
  schools: {
    total: number;
    active: number;
    suspended: number;
  };
  people: {
    totalStudents: number;
    totalClasses: number;
    totalDirectors: number;
    totalTeachers: number;
    totalParents: number;
  };
  bySchool: Array<{
    schoolId: string;
    schoolName: string;
    matricule: string;
    studentCount: number;
    classCount: number;
    teacherCount: number;
    status: "AUCUN" | "ACTIF" | "EXPIRE" | "INACTIF";
  }>;
  recentActivity: Array<{
    action: string;
    entity: string;
    createdAt: string;
    schoolId: string | null;
    actorRole: string | null;
  }>;
  subscriptions: {
    active: number;
    expiringSoon: number;
    expired: number;
    none: number;
    pendingRequests: number;
    pendingAmount: number;
    mrr: number;
    revenueThisMonth: number;
  };
}

/* ------------------------------------------------------------------ */
/* Abonnements (console admin)                                          */
/* ------------------------------------------------------------------ */

export interface AdminSubscriptionSummary {
  totalSchools: number;
  active: number;
  expiringSoon: number;
  expired: number;
  none: number;
  suspendedSchools: number;
  pendingRequests: number;
  pendingRequestsAmount: number;
  mrr: number;
  arr: number;
}

export interface AdminSubscriptionRow {
  schoolId: string;
  schoolName: string;
  matricule: string;
  city: string;
  planId: string | null;
  planName: string | null;
  planMonthlyPrice: number;
  startsAt: string | null;
  endsAt: string | null;
  daysLeft: number | null;
  amountPaid: number;
  method: string | null;
  paidAt: string | null;
  studentLimit: number | null;
  status: "ACTIF" | "EXPIRE" | "AUCUN";
  registrationOpen: boolean;
  expiringSoon: boolean;
}

export interface AdminSubscriptionRequest {
  id: string;
  schoolId: string;
  schoolName: string;
  matricule: string;
  planId: string;
  planName: string;
  cycle: "monthly" | "yearly";
  studentCount: number;
  amount: number;
  status: "EN_ATTENTE" | "ACTIVEE" | "ANNULEE";
  createdAt: string;
  decidedAt: string | null;
}

export interface AdminPlan {
  id: string;
  name: string;
  tagline: string;
  studentLimit: number | null;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  highlight: boolean;
  activeSchools: number;
  totalRevenue: number;
  mrr: number;
}

export interface AdminSubscriptionsData {
  generatedAt: string;
  summary: AdminSubscriptionSummary;
  subscriptions: {
    rows: AdminSubscriptionRow[];
    total: number;
    page: number;
    pageSize: number;
  };
  plans: AdminPlan[];
  requests: AdminSubscriptionRequest[];
}

/* ------------------------------------------------------------------ */
/* Finances (console admin)                                             */
/* ------------------------------------------------------------------ */

export interface AdminFinanceSummary {
  revenueTotal: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  revenueYtd: number;
  mrr: number;
  arr: number;
  averagePerPayingSchool: number;
  payingSchools: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  atRiskMrr: number;
  renewalsDue30: number;
  renewalsDue30Amount: number;
  pendingRequests: number;
  pendingRequestsAmount: number;
  paidActivations: number;
}

export interface AdminFinanceMonthlyPoint {
  key: string;
  label: string;
  revenue: number;
  events: number;
  purchases: number;
  renewals: number;
}

export interface AdminFinancePlan {
  planId: string;
  name: string;
  monthlyPrice: number;
  activeSubscriptions: number;
  activations: number;
  revenue: number;
  mrr: number;
}

export interface AdminFinanceMethod {
  method: string;
  count: number;
  amount: number;
}

export interface AdminFinanceEvent {
  id: string;
  schoolId: string;
  schoolName: string;
  matricule: string;
  eventType: "purchase" | "renewal" | "plan_change" | "expiration_warning";
  planId: string | null;
  planName: string;
  amountPaid: number;
  method: string | null;
  paymentRef: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export interface AdminFinancesData {
  generatedAt: string;
  today: string;
  monthStart: string;
  summary: AdminFinanceSummary;
  monthly: AdminFinanceMonthlyPoint[];
  byPlan: AdminFinancePlan[];
  byMethod: AdminFinanceMethod[];
  recentEvents: AdminFinanceEvent[];
  /** Journal des mouvements (1 000 derniers), pour les onglets Transactions et Factures. */
  events?: AdminFinanceEvent[];
  eventsTruncated?: boolean;
  schoolsWithSubscription: number;
}

/* ------------------------------------------------------------------ */
/* Analyses (console admin)                                             */
/* ------------------------------------------------------------------ */

export interface AdminAnalyticsGrowthPoint {
  key: string;
  label: string;
  newSchools: number;
  newStudents: number;
  totalSchools: number;
}

export interface AdminAnalyticsData {
  generatedAt: string;
  summary: {
    totalSchools: number;
    activeSchools: number;
    payingSchools: number;
    newSchoolsThisMonth: number;
    newSchoolsLastMonth: number;
    schoolsGrowthPct: number;
    studentsThisMonth: number;
    studentsLastMonth: number;
    totalStudents: number;
    totalClasses: number;
    totalTeachers: number;
    totalParents: number;
    averageStudentsPerSchool: number;
    conversionRate: number;
    churnRate: number;
    mrr: number;
  };
  growth: AdminAnalyticsGrowthPoint[];
  byCity: Array<{ city: string; schools: number; students: number }>;
  byCycle: Array<{ cycle: string; label: string; schools: number }>;
  byPlan: Array<{ planId: string; name: string; monthlyPrice: number; schools: number; share: number }>;
  topSchools: Array<{
    schoolId: string;
    schoolName: string;
    matricule: string;
    students: number;
    classes: number;
    teachers: number;
    subscriptionStatus: string;
  }>;
}

/* ------------------------------------------------------------------ */
/* Journal d'audit (console admin)                                      */
/* ------------------------------------------------------------------ */

export interface AdminAuditRow {
  id: string;
  schoolId: string | null;
  schoolName: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAuditData {
  generatedAt: string;
  periodDays: number;
  retentionDays: number;
  total: number;
  page: number;
  pageSize: number;
  rows: AdminAuditRow[];
  actionCounts: Array<{ action: string; count: number }>;
}

/* ------------------------------------------------------------------ */
/* Sécurité (console admin)                                             */
/* ------------------------------------------------------------------ */

export interface AdminSecurityData {
  generatedAt: string;
  summary: {
    totalAgents: number;
    activeAgents: number;
    disabledAgents: number;
    pendingAgents: number;
    logins30: number;
    blocked30: number;
    blockedRate: number;
    lastLoginAt: string | null;
    activeRateLimits: number;
    auditEvents24h: number;
  };
  agents: Array<{
    id: string;
    matricule: string;
    role: AdminAgentRole;
    status: "ACTIF" | "EN_ATTENTE" | "DESACTIVE";
    firstName: string;
    lastName: string;
    email: string;
    createdAt: string;
    lastLoginAt: string | null;
    loginCount30: number;
    blockedCount30: number;
  }>;
  daily: Array<{ key: string; label: string; logins: number; blocked: number }>;
  alerts: Array<{
    id: string;
    action: string;
    actorRole: string | null;
    actorName: string | null;
    createdAt: string;
    payload: Record<string, unknown>;
  }>;
  sensitiveActions: Array<{
    id: string;
    action: string;
    actorRole: string | null;
    actorName: string | null;
    entity: string;
    entityId: string | null;
    schoolId: string | null;
    createdAt: string;
    payload: Record<string, unknown>;
  }>;
  rateLimits: Array<{ key: string; count: number; windowStart: string }>;
}

/* ------------------------------------------------------------------ */
/* Paramètres de la plateforme                                          */
/* ------------------------------------------------------------------ */

export interface PlatformSettings {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  schoolYear: string;
  registrationOpen: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  sessionTimeoutMinutes: number;
  auditRetentionDays: number;
}

export interface PlatformStatus extends Omit<PlatformSettings, "auditRetentionDays"> {
  migrationApplied?: boolean;
}

export interface AdminSettingsData {
  settings: PlatformSettings;
  migrationApplied: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
  canEdit: boolean;
}

/* ------------------------------------------------------------------ */
/* École vue admin (transversale)                                       */
/* ------------------------------------------------------------------ */

export interface AdminSchool {
  id: string;
  name: string;
  matricule: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  logoUrl?: string;
  cycles: string[];
  registrationOpen: boolean;
  autoApproveStudents: boolean;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Comptes                                                               */
/* ------------------------------------------------------------------ */

/**
 * Un utilisateur appartient à UNE école (schoolId). Aucun service ne doit lire
 * une ligne de donnée dont le schoolId diffère de celui de la session.
 * `passwordHash` n'est jamais renvoyé au client : voir services/authService.
 */
export interface User {
  id: string;
  schoolId: string;
  email: string;
  /** Empreinte simulée — le vrai hachage se fait côté serveur (voir SUPABASE_NOTES.md). */
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: Role;
  status: UserStatus;
  /** Mot de passe temporaire : changement obligatoire avant d'accéder à l'application. */
  mustChangePassword: boolean;
  createdAt: string;
  teacherId?: string;
  parentId?: string;
  studentId?: string;
}

export type SessionUser = Omit<User, "passwordHash">;

export interface LevelFees {
  inscription: number;
  mensualite: number;
}

export interface SchoolSettings {
  schoolId: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  schoolYear: string;
  cycles: Cycle[];
  periodType: PeriodType;
  currentPeriod: string;
  fees: Record<string, LevelFees>;
  annexFees: { cantine: number; transport: number; tenue: number };
  siblingDiscount: number;
  blockStudentBulletins?: boolean;
}

export interface Period {
  id: string;
  label: string;
}

export interface ReportLine {
  subjectId: string;
  subjectName: string;
  coefficient: number;
  devoir1: number | null;
  devoir2: number | null;
  devoirsAvg: number | null;
  composition: number | null;
  average: number | null;
  rank: number | null;
  teacherName: string;
  appreciation: string;
}

export interface ReportCardData {
  student: Student;
  classRoom: ClassRoom;
  period: Period;
  lines: ReportLine[];
  generalAverage: number | null;
  rank: number | null;
  classSize: number;
  classAverage: number | null;
  /** Appréciation / conduite réellement saisies ; null tant que la direction n'a rien renseigné. */
  meta: ReportMeta | null;
  headTeacherName: string;
}

export interface Conflict {
  id: string;
  severity: "error" | "warning";
  classId?: string;
  subjectId?: string;
  teacherId?: string;
  message: string;
}