import type {
  Cycle,
  Parent,
  Role,
  SchoolRegistrationRequest,
  SessionUser,
  StaffRole,
  Student,
  Teacher,
  User,
} from "@/types";
import { canManageStaff, isStaffRole } from "@/utils/permissions";
import { callFunction } from "@/lib/functions";
import { supabase } from "@/lib/supabase";
import { hydrate, hydrateAll, db, clearCache } from "./db";

/**
 * Flows d'authentification branchés sur Supabase :
 *   - connexion        : Supabase Auth + Edge Function `login-guard` (messages FR
 *     identiques : désactivé / en attente / lecture seule gérée par les RLS) ;
 *   - inscriptions     : Edge Functions `register-*` (transactions RPC
 *     `finish_*_registration`) ; les demandes restent EN_ATTENTE.
 * Le DENGISTE UI reste : SessionUser dérivé de `profiles`.
 * Gère aussi les comptes du personnel créés par la direction (table profiles).
 */

export interface DirectorInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  schoolName: string;
  city: string;
  /** Adresse de l'école (p_address, migration 00023). */
  address?: string;
  cycles: Cycle[];
  plan?: "essentiel" | "premium";
}

function toSession(u: User): SessionUser {
  const { passwordHash: _hash, ...rest } = u;
  void _hash;
  return rest as SessionUser;
}

const lower = (s: string) => s.trim().toLowerCase();

/* ------------------------------------------------------------------ */
/* Session                                                              */
/* ------------------------------------------------------------------ */

/** Y a-t-il un jeton de session Auth en local ? (sans hydrater les données) */
export async function hasAuthSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session?.user;
}

/** Profils de la session courante ; null si non connecté. */
export async function currentSession(): Promise<SessionUser | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.user) {
    await clearCache();
    return null;
  }
  await hydrateAll();
  const profile = db.users.find((u) => u.id === session.user.id);
  if (!profile) {
    // Compte Auth sans profil scolaire exploitable (peut être un agent admin
    // dont le profil vit dans admin_agents, pas dans profiles). On ne se
    // déconnecte pas brutalement : on rend null et laisse le contexte
    // appelant (AuthProvider ou AdminAuthProvider) décider.
    await clearCache();
    return null;
  }
  if (profile.status !== "ACTIF") {
    // DESACTIVE ou EN_ATTENTE : la session Auth (encore émise par Supabase)
    // n'est pas exploitable ; les politiques RLS le ferment côté données,
    // on le reflète côté application en refermant la session.
    await supabase.auth.signOut();
    await clearCache();
    return null;
  }
  return toSession(profile);
}

// Déconnecte la session Supabase Auth (les données restent en cache jusqu'au prochain clear).
// scope "local" : on retire la session du stockage local sans attendre un aller-retour
// réseau (qui peut prendre plusieurs secondes et bloquer le client Auth) — la
// déconnexion doit être instantanée côté utilisateur.
export function logout(): void {
  void supabase.auth.signOut({ scope: "local" });
}

/* ------------------------------------------------------------------ */
/* Connexion                                                            */
/* ------------------------------------------------------------------ */

/**
 * Connexion unique pour tous les rôles. Contrôles, dans l'ordre :
 * identifiants → compte désactivé → compte en attente d'approbation →
 * matricule d'école (si fourni : le compte doit appartenir à l'école
 * correspondante) → mot de passe temporaire (redirigé par
 * MustChangePasswordGuard).
 */
export async function login(email: string, password: string, matricule?: string): Promise<SessionUser> {
  const cred = lower(email);
  const { error } = await supabase.auth.signInWithPassword({ email: cred, password });
  if (error) {
    // Message unique pour tous les refus d'Auth : ne pas révéler si c'est
    // l'adresse ou le mot de passe qui est faux (anti-énumération).
    throw new Error("E-mail ou mot de passe incorrect.");
  }
  const session = (await supabase.auth.getSession()).data.session;
  const id = session?.user?.id;
  const jwt = session?.access_token;
  if (!id || !jwt) throw new Error("Session indisponible. Reconnectez-vous.");
  let guard: { status?: string; error?: string; schoolId?: string; role?: string; mustChangePassword?: boolean };
  try {
    guard = await callFunction<{
      status?: string;
      error?: string;
      schoolId?: string;
      role?: string;
      mustChangePassword?: boolean;
    }>("login-guard");
  } catch (e) {
    // Garde injoignable (limite de débit incluse) : on NE CONSERVE PAS la
    // session Auth (l'ancien code la laissait ouverte sur échec du garde)...
    await supabase.auth.signOut();
    await clearCache();
    throw e instanceof Error ? e : new Error("Connexion impossible. Réessayez.");
  }
  const envelope = (guard ?? {}) as Record<string, unknown>;
  if ((envelope.error as string | undefined) && envelope.status !== "ACTIF") {
    await supabase.auth.signOut();
    await clearCache();
    throw new Error(envelope.error as string);
  }
  if ((envelope.status as string | undefined) !== "ACTIF") {
    await supabase.auth.signOut();
    await clearCache();
    throw new Error("Connexion impossible. Réessayez.");
  }
  await hydrateAll();
  if (matricule !== undefined) {
    const profile = db.users.find((u) => u.id === id);
    const school = profile ? db.schools.find((s) => s.id === profile.schoolId) : undefined;
    const expected = (school?.matricule ?? "").trim().toUpperCase();
    // Une école pas encore activée n'a pas de matricule : la vérification ne
    // s'applique qu'aux écoles déjà équipées d'un code.
    if (expected && matricule.trim().toUpperCase() !== expected) {
      await supabase.auth.signOut();
      await clearCache();
      throw new Error("Le matricule saisi ne correspond pas à votre école. Vérifiez-le auprès de la direction.");
    }
  }
  return (await currentSession()) || (() => {
    throw new Error("E-mail ou mot de passe incorrect.");
  })();
}

/* ------------------------------------------------------------------ */
/* Inscriptions publiques : directeur, élève, parent                    */
/* ------------------------------------------------------------------ */

/**
 * Inscription d'un directeur : il crée son école (sans abonnement ni matricule).
 * Session ouverte automatiquement, l'écran suivant est la vérification des informations.
 */
export async function registerDirector(input: DirectorInput): Promise<SessionUser> {
  await callFunction("register-director", input);
  // L'EF inscrit sans ouvrir de session : on connecte immédiatement.
  return login(input.email, input.password);
}

export interface StudentSignupInput {
  schoolId: string;
  firstName: string;
  lastName: string;
  gender: "F" | "M";
  birthDate: string;
  classId: string;
  email: string;
  phone: string;
  password: string;
}

/** Inscription d'un élève : compte créé en attente, la direction valide ensuite. */
export async function registerStudent(
  input: StudentSignupInput,
): Promise<{ user: SessionUser; requestId: string; childCode?: string }> {
  const result = await callFunction<{
    user: { id: string; email: string; firstName: string; lastName: string; role: string; status: string };
    requestId: string;
    approved: boolean;
    child_code?: string;
  }>("register-student", input);
  const user: User = {
    id: result.user.id,
    schoolId: input.schoolId,
    email: result.user.email,
    passwordHash: "",
    firstName: result.user.firstName,
    lastName: result.user.lastName,
    phone: input.phone.trim(),
    role: "eleve",
    status: result.user.status as User["status"],
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };
  return { user: toSession(user), requestId: result.requestId, childCode: result.child_code };
}

export interface EnrolledStudentSignupInput {
  schoolId: string;
  /** Matricule unique de l'élève, généré à son inscription par la direction (ex. EC260001). */
  studentMatricule: string;
  email: string;
  phone: string;
  password: string;
}

/** Création du compte d'un élève déjà inscrit, via son matricule : le compte
 *  est rattaché à sa fiche (ACTIF immédiatement). Le matricule ne sert qu'à
 *  cette création ; la connexion reste matricule d'école + e-mail + mot de passe. */
export async function registerEnrolledStudent(
  input: EnrolledStudentSignupInput,
): Promise<{ user: SessionUser; studentId: string; studentMatricule: string }> {
  const result = await callFunction<{
    user: { id: string; email: string; firstName: string; lastName: string; role: string; status: string };
    studentId: string;
    studentMatricule: string;
  }>("register-enrolled-student", input);
  const user: User = {
    id: result.user.id,
    schoolId: input.schoolId,
    email: result.user.email,
    passwordHash: "",
    firstName: result.user.firstName,
    lastName: result.user.lastName,
    phone: input.phone.trim(),
    role: "eleve",
    status: result.user.status as User["status"],
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };
  return { user: toSession(user), studentId: result.studentId, studentMatricule: result.studentMatricule };
}

export interface ParentSignupInput {
  schoolId: string;
  childCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
}

/** Inscription d'un parent : le code enfant rattache le compte à un élève de CETTE école. */
export async function registerParent(
  input: ParentSignupInput,
): Promise<{ user: SessionUser; requestId: string; childName: string }> {
  const result = await callFunction<{
    user: { id: string; email: string; firstName: string; lastName: string; role: string; status: string };
    requestId: string;
    approved: boolean;
    childName: string;
  }>("register-parent", input);
  const user: User = {
    id: result.user.id,
    schoolId: input.schoolId,
    email: result.user.email,
    passwordHash: "",
    firstName: result.user.firstName,
    lastName: result.user.lastName,
    phone: input.phone.trim(),
    role: "parent",
    status: result.user.status as User["status"],
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  };
  if (result.approved) await login(input.email, input.password);
  return { user: toSession(user), requestId: result.requestId, childName: result.childName };
}

/** Rattachement d'un enfant supplémentaire (autre code) depuis l'espace parent. */
export async function linkChild(actor: SessionUser, childCode: string): Promise<Student> {
  if (actor.role !== "parent" || !actor.parentId) throw new Error("Action réservée aux comptes parents.");
  const { error } = await supabase.rpc("link_child", {
    p_child_code: childCode.trim().toUpperCase(),
  });
  if (error) throw new Error(error.message);
  await hydrate("students");
  const child = db.students.find((s) => s.childCode.toUpperCase() === childCode.trim().toUpperCase());
  if (!child) throw new Error("Code élève introuvable dans votre école. Vérifiez le code reçu auprès de l'école.");
  return child;
}

/* ------------------------------------------------------------------ */
/* Comptes créés par la direction (enseignants, économe, surveillant)   */
/* ------------------------------------------------------------------ */

export interface StaffAccountInput {
  role: StaffRole;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialties: string[];
  /** Mot de passe définitif choisi par le directeur. */
  password: string;
}

export interface StaffCredentials {
  userId: string;
  email: string;
  /** Affiché UNE SEULE FOIS à la création. */
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
}

/** Création d'un accès par le directeur (et uniquement par lui). */
export async function createStaffAccount(actor: SessionUser, input: StaffAccountInput): Promise<StaffCredentials> {
  if (!canManageStaff(actor.role)) throw new Error("Seule la direction peut créer un accès.");
  if (!isStaffRole(input.role)) throw new Error("Rôle invalide.");

  // Vérification du plan pour les rôles premium (économe, secrétaire, surveillant)
  const premiumStaffRoles: StaffRole[] = ["econome", "secretaire", "surveillant"];
  if (premiumStaffRoles.includes(input.role)) {
    const { requireFeature } = await import("@/utils/features");
    requireFeature("staff_accounts", actor.schoolId);
  }

  const credentials = await callFunction<{
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
  }>("create-staff-account", {
    role: input.role,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    specialties: input.role === "professeur" ? input.specialties : [],
    password: input.password.trim(),
  });
  await Promise.all([hydrate("users"), hydrate("teachers")]);
  // Le mot de passe affiché une seule fois est celui saisi par la direction
  // (l'API ne le renvoie plus).
  return { ...credentials, password: input.password.trim() };
}

// Met à jour les infos d'un compte du personnel, via l'Edge Function côté serveur.
export async function updateStaff(
  actor: SessionUser,
  userId: string,
  patch: { firstName?: string; lastName?: string; email?: string; phone?: string; specialties?: string[] },
): Promise<User> {
  void actor;
  await callFunction("update-staff", {
    userId,
    ...(patch.firstName !== undefined ? { firstName: patch.firstName.trim() } : {}),
    ...(patch.lastName !== undefined ? { lastName: patch.lastName.trim() } : {}),
    ...(patch.email !== undefined ? { email: patch.email.trim() } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone.trim() } : {}),
    ...(patch.specialties !== undefined ? { specialties: patch.specialties } : {}),
  });
  await hydrate("users");
  const account = db.users.find((u) => u.id === userId);
  if (!account) throw new Error("Compte introuvable dans votre école.");
  return account;
}

/** Réinitialisation : le directeur fournit le nouveau mot de passe. Aucun secret n'est généré ni transmis par le serveur. */
export async function resetStaffPassword(
  actor: SessionUser,
  userId: string,
  newPassword: string
): Promise<StaffCredentials> {
  void actor;
  const credentials = await callFunction<{
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role;
  }>("reset-staff-password", { userId, newPassword });
  await hydrate("users");
  // Le mot de passe vient de la saisie du directeur : aucun secret serveur→client.
  return {
    userId: credentials.userId,
    email: credentials.email,
    password: newPassword,
    firstName: credentials.firstName,
    lastName: credentials.lastName,
    role: credentials.role,
  };
}

/** Désactivation / réactivation : un compte désactivé ne peut plus se connecter. */
export async function setStaffActive(actor: SessionUser, userId: string, active: boolean): Promise<User> {
  if (userId === actor.id) throw new Error("Vous ne pouvez pas désactiver votre propre compte.");
  await callFunction("set-staff-active", { userId, active });
  await hydrate("users");
  const account = db.users.find((u) => u.id === userId);
  if (!account) throw new Error("Compte introuvable dans votre école.");
  return account;
}

/** Suppression définitive d'un accès : le compte ne peut plus se connecter.
 *  La fiche enseignant éventuellement liée est conservée (« Sans accès »). */
export async function deleteStaffAccount(actor: SessionUser, userId: string): Promise<void> {
  if (userId === actor.id) throw new Error("Vous ne pouvez pas supprimer votre propre compte.");
  await callFunction("delete-staff-account", { userId });
  await hydrate("users");
}

/** Changement de mot de passe (première connexion d'un accès créé par la direction). */
export async function changePassword(actor: SessionUser, currentPassword: string, nextPassword: string): Promise<void> {
  void actor;
  if (currentPassword === nextPassword) {
    throw new Error("Choisissez un mot de passe différent de l'ancien.");
  }
  const { error } = await supabase.auth.updateUser({ password: nextPassword });
  if (error) throw new Error("Impossible de changer le mot de passe. Réessayez.");
  const { error: flagError } = await supabase.rpc("complete_password_change");
  if (flagError) throw new Error("Impossible de changer le mot de passe. Réessayez.");
}

// Met à jour le profil de l'utilisateur connecté (table profiles).
export function updateProfile(
  actor: SessionUser,
  patch: { firstName?: string; lastName?: string; email?: string; phone?: string },
): Promise<User> {
  return (async () => {
    const payload: Record<string, unknown> = {};
    if (patch.firstName !== undefined) payload.first_name = patch.firstName.trim();
    if (patch.lastName !== undefined) payload.last_name = patch.lastName.trim();
    if (patch.email !== undefined) payload.email = patch.email.trim();
    if (patch.phone !== undefined) payload.phone = patch.phone.trim();
    if (Object.keys(payload).length) {
      const { error } = await supabase.from("profiles").update(payload).eq("id", actor.id);
      if (error) throw new Error(/duplicate/i.test(error.message) ? "Un compte existe déjà avec cet e-mail." : error.message);
    }
    await hydrate("users");
    const account = db.users.find((u) => u.id === actor.id);
    if (!account) throw new Error("Compte introuvable.");
    return account;
  })();
}

// Envoie l'e-mail de réinitialisation (ne révèle pas si l'adresse existe).
export async function requestPasswordReset(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}/reinitialiser-mot-de-passe`;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  // Pour des raisons de sécurité, on ne révèle pas si l'e-mail existe.
  if (error) throw new Error("Impossible d'envoyer l'e-mail de réinitialisation. Réessayez.");
}

// Définit le nouveau mot de passe après ouverture du lien de réinitialisation.
export async function resetPassword(nextPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: nextPassword });
  if (error) throw new Error("Impossible de réinitialiser le mot de passe. Le lien a peut-être expiré.");
  const { error: flagError } = await supabase.rpc("complete_password_change");
  void flagError;
  await clearCache();
}

/** Liste des demandes en attente d'approbation (utilisé par ApprisonersGuard). */
export const registrationRequestOf = (requestId: string): SchoolRegistrationRequest | undefined =>
  db.registrationRequests.find((r) => r.id === requestId);

/** Liste des accès du personnel d'une école (page /app/enseignants). */
export interface StaffRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: Role;
  status: User["status"];
  mustChangePassword: boolean;
  teacherId?: string;
  createdAt: string;
}

export const listStaff = (schoolId: string): Promise<StaffRow[]> =>
  (async () => {
    await hydrate("users");
    return db.users
      .filter((u) => u.schoolId === schoolId && u.role !== "directeur" && u.role !== "eleve" && u.role !== "parent")
      .map((u) => ({
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        mustChangePassword: u.mustChangePassword,
        ...(u.teacherId ? { teacherId: u.teacherId } : {}),
        createdAt: u.createdAt,
      }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"));
  })();

/** Parents rattachés (-espace formulaire). */
export const listParentContacts = (): Parent[] => db.parents;

/** Enseignants (présélection). */
export const listTeacherContacts = (): Teacher[] => db.teachers;
