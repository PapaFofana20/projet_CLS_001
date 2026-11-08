// Session utilisateur : connexion, inscriptions et déconnexion, école incluse.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SessionUser } from "@/types";
import * as authService from "@/services/authService";
import { clearCache } from "@/services/db";
import type { DirectorInput, EnrolledStudentSignupInput, ParentSignupInput, StaffAccountInput, StaffCredentials, StudentSignupInput } from "@/services/authService";

interface AuthContextValue {
  user: SessionUser | null;
  /** Vrai tant que la session n'a pas été restaurée depuis Supabase. */
  loadingSession: boolean;
  /** Vérification rapide faite : un jeton Auth existe-t-il en local ? */
  sessionChecked: boolean;
  hasSession: boolean;
  /** École de la session : toutes les lectures de données passent par cet identifiant. */
  schoolId: string;
  /** Vrai juste après une déconnexion : on retourne alors sur la landing page. */
  justLoggedOut: boolean;
  login: (email: string, password: string, matricule?: string) => Promise<SessionUser>;
  registerDirector: (input: DirectorInput) => Promise<SessionUser>;
  registerStudent: (input: StudentSignupInput) => Promise<{ user: SessionUser; childCode?: string }>;
  registerEnrolledStudent: (input: EnrolledStudentSignupInput) => Promise<{ user: SessionUser; studentId: string; studentMatricule: string }>;
  registerParent: (input: ParentSignupInput) => Promise<{ user: SessionUser; childName: string }>;
  changePassword: (current: string, next: string) => Promise<void>;
  createStaffAccount: (input: StaffAccountInput) => Promise<StaffCredentials>;
  refresh: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Restaure la session au démarrage et expose les fonctions d'authentification.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [justLoggedOut, setJustLoggedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Vérification rapide d'abord (jeton local uniquement) : les pages
      // publiques /connexion et /inscription peuvent s'afficher aussitôt
      // pour un visiteur non connecté, sans attendre l'hydratation complète
      // des 18 tables (currentSession ci-dessous, réservée à /app).
      try {
        const exists = await authService.hasAuthSession();
        if (!cancelled) {
          setHasSession(exists);
          setSessionChecked(true);
        }
      } catch {
        if (!cancelled) setSessionChecked(true);
      }
      try {
        const session = await authService.currentSession();
        if (!cancelled) {
          setUser(session);
          if (!session) setHasSession(false);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, matricule?: string) => {
    const u = await authService.login(email, password, matricule);
    setUser(u);
    setHasSession(true);
    setSessionChecked(true);
    setJustLoggedOut(false);
    return u;
  }, []);

  const registerDirector = useCallback(async (input: DirectorInput) => {
    const u = await authService.registerDirector(input);
    setUser(u);
    setHasSession(true);
    setSessionChecked(true);
    setJustLoggedOut(false);
    // Notifier le SchoolProvider de recharger l'école pour récupérer le matricule fraîchement généré
    window.dispatchEvent(new CustomEvent("school:reload"));
    return u;
  }, []);

  const registerStudent = useCallback(async (input: StudentSignupInput) => {
    const { user: u, childCode } = await authService.registerStudent(input);
    setUser(u);
    setHasSession(true);
    setSessionChecked(true);
    setJustLoggedOut(false);
    return { user: u, childCode };
  }, []);

  const registerEnrolledStudent = useCallback(async (input: EnrolledStudentSignupInput) => {
    const { user: u, studentId, studentMatricule } = await authService.registerEnrolledStudent(input);
    setUser(u);
    setHasSession(true);
    setSessionChecked(true);
    setJustLoggedOut(false);
    return { user: u, studentId, studentMatricule };
  }, []);

  const registerParent = useCallback(async (input: ParentSignupInput) => {
    const { user: u, childName } = await authService.registerParent(input);
    setUser(u);
    setHasSession(true);
    setSessionChecked(true);
    setJustLoggedOut(false);
    return { user: u, childName };
  }, []);

  const changePassword = useCallback(
    async (current: string, next: string) => {
      if (!user) throw new Error("Aucun utilisateur connecté.");
      await authService.changePassword(user, current, next);
      const fresh = await authService.currentSession();
      if (fresh) setUser(fresh);
    },
    [user],
  );

  const createStaffAccount = useCallback(
    async (input: StaffAccountInput) => {
      if (!user) throw new Error("Aucun utilisateur connecté.");
      return authService.createStaffAccount(user, input);
    },
    [user],
  );

  /** Recharge la session (après un changement de mot de passe ou une décision de la direction). */
  const refresh = useCallback(async () => {
    const stored = await authService.currentSession();
    if (stored) setUser(stored);
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    // D'abord l'état React (déconnexion + navigation se peignent sans attendre),
    // puis le vidage du cache, différé après le rendu : vider les 18 tables de
    // façon synchrone dans le même geste bloquait le thread principal et
    // provoquait un « lag » visible à chaque déconnexion.
    setJustLoggedOut(true);
    setUser(null);
    setHasSession(false);
    // On vide le cache sans re-télécharger : resetDatabase() relançait une
    // hydratation complète JUSTE après la déconnexion (appels RLS refusés) ;
    // le prochain currentSession() rechargera ce qui est nécessaire.
    window.setTimeout(() => {
      void clearCache();
    }, 0);
  }, []);

  const value = useMemo(
    () => ({ user, loadingSession, sessionChecked, hasSession, schoolId: user?.schoolId ?? "", justLoggedOut, login, registerDirector, registerStudent, registerEnrolledStudent, registerParent, changePassword, createStaffAccount, refresh, logout }),
    [user, loadingSession, sessionChecked, hasSession, justLoggedOut, login, registerDirector, registerStudent, registerEnrolledStudent, registerParent, changePassword, createStaffAccount, refresh, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Lit la session courante depuis n'importe quel composant.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>.");
  return ctx;
}

// Raccourci quand on est sûr qu'un utilisateur est connecté (lève, prof, parent…).
export function useCurrentUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error("Aucun utilisateur connecté.");
  return user;
}
