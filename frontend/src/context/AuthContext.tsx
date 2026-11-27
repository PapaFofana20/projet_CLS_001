// Session utilisateur : connexion, inscriptions et déconnexion, école incluse.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  /** Erreur survenue pendant la restauration de session (journalisée et exposée). */
  sessionError: string | null;
  login: (email: string, password: string, matricule?: string) => Promise<SessionUser>;
  registerDirector: (input: DirectorInput) => Promise<SessionUser>;
  /** `user` est null tant que la demande d'inscription n'est pas approuvée. */
  registerStudent: (input: StudentSignupInput) => Promise<{ user: SessionUser | null; childCode?: string }>;
  registerEnrolledStudent: (input: EnrolledStudentSignupInput) => Promise<{ user: SessionUser; studentId: string; studentMatricule: string }>;
  registerParent: (input: ParentSignupInput) => Promise<{ user: SessionUser | null; childName: string }>;
  changePassword: (current: string, next: string) => Promise<void>;
  createStaffAccount: (input: StaffAccountInput) => Promise<StaffCredentials>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Restaure la session au démarrage et expose les fonctions d'authentification.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [justLoggedOut, setJustLoggedOut] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  /**
   * Incrémenté à chaque changement de session (login / register / logout).
   * La restauration au démarrage est asynchrone : si l'utilisateur agit avant
   * qu'elle se termine, son résultat est périmé et ne doit PAS écraser la
   * décision plus récente (race condition F5 + connexion rapide).
   */
  const sessionEpoch = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const epochAtStart = sessionEpoch.current;
    const isStale = () => cancelled || sessionEpoch.current !== epochAtStart;
    (async () => {
      // Vérification rapide d'abord (jeton local uniquement) : les pages
      // publiques /connexion et /inscription peuvent s'afficher aussitôt
      // pour un visiteur non connecté, sans attendre l'hydratation complète
      // des 18 tables (currentSession ci-dessous, réservée à /app).
      try {
        const exists = await authService.hasAuthSession();
        if (!isStale()) {
          setHasSession(exists);
          setSessionChecked(true);
        }
      } catch (e) {
        console.error("[auth] vérification du jeton de session :", e);
        if (!isStale()) {
          setSessionError(e instanceof Error ? e.message : "Vérification de session impossible.");
          setSessionChecked(true);
        }
      }
      try {
        const session = await authService.currentSession();
        if (!isStale()) {
          setUser(session);
          if (!session) setHasSession(false);
          setSessionError(null);
        }
      } catch (e) {
        console.error("[auth] restauration de session :", e);
        if (!isStale()) {
          setUser(null);
          setSessionError(e instanceof Error ? e.message : "Restauration de session impossible.");
        }
      } finally {
        // Même périmée, la restauration ne doit pas laisser l'écran de
        // chargement bloqué : une connexion plus récente a déjà répondu.
        if (!cancelled) setLoadingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string, matricule?: string) => {
    const u = await authService.login(email, password, matricule);
    sessionEpoch.current += 1;
    setUser(u);
    setHasSession(true);
    setSessionChecked(true);
    setJustLoggedOut(false);
    setSessionError(null);
    return u;
  }, []);

  const registerDirector = useCallback(async (input: DirectorInput) => {
    const u = await authService.registerDirector(input);
    sessionEpoch.current += 1;
    setUser(u);
    setHasSession(true);
    setSessionChecked(true);
    setJustLoggedOut(false);
    setSessionError(null);
    // Notifier le SchoolProvider de recharger l'école pour récupérer le matricule fraîchement généré
    window.dispatchEvent(new CustomEvent("school:reload"));
    return u;
  }, []);

  const registerStudent = useCallback(async (input: StudentSignupInput) => {
    const { user: u, childCode } = await authService.registerStudent(input);
    if (u) {
      sessionEpoch.current += 1;
      setUser(u);
      setHasSession(true);
      setSessionChecked(true);
      setJustLoggedOut(false);
      setSessionError(null);
    }
    // En attente : aucun user posé, l'écran d'attente reste affiché.
    return { user: u, childCode };
  }, []);

  const registerEnrolledStudent = useCallback(async (input: EnrolledStudentSignupInput) => {
    const { user: u, studentId, studentMatricule } = await authService.registerEnrolledStudent(input);
    sessionEpoch.current += 1;
    setUser(u);
    setHasSession(true);
    setSessionChecked(true);
    setJustLoggedOut(false);
    setSessionError(null);
    return { user: u, studentId, studentMatricule };
  }, []);

  const registerParent = useCallback(async (input: ParentSignupInput) => {
    const { user: u, childName } = await authService.registerParent(input);
    if (u) {
      sessionEpoch.current += 1;
      setUser(u);
      setHasSession(true);
      setSessionChecked(true);
      setJustLoggedOut(false);
      setSessionError(null);
    }
    return { user: u, childName };
  }, []);

  const changePassword = useCallback(
    async (current: string, next: string) => {
      if (!user) throw new Error("Aucun utilisateur connecté.");
      await authService.changePassword(user, current, next);
      const fresh = await authService.currentSession();
      if (fresh) {
        sessionEpoch.current += 1;
        setUser(fresh);
      }
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

  /** Recharge la session (après un changement de mot de passe ou une décision de la direction).
   *  Re-synchronise aussi schoolId et notifie les écrans dépendants (SchoolContext). */
  const refresh = useCallback(async () => {
    const stored = await authService.currentSession();
    sessionEpoch.current += 1;
    if (stored) {
      setUser(stored);
      // Notifier le SchoolProvider et tous les abonnés que l'école de la session a changé.
      window.dispatchEvent(new CustomEvent("school:reload"));
    }
  }, []);

  const logout = useCallback(async () => {
    // Invalide d'abord toute restauration en vol, puis révoque la session
    // Auth (côté serveur), puis vide le cache : cet ordre garantit qu'aucune
    // donnée de l'ancien compte ne peut réapparaître après la navigation.
    sessionEpoch.current += 1;
    // État React immédiat (les appelants naviguent sans toujours attendre la
    // promesse), puis révocation Auth, puis vidage du cache.
    setJustLoggedOut(true);
    setUser(null);
    setHasSession(false);
    setSessionChecked(true);
    setSessionError(null);
    await authService.logout();
    await clearCache();
  }, []);

  const value = useMemo(
    () => ({ user, loadingSession, sessionChecked, hasSession, schoolId: user?.schoolId ?? "", justLoggedOut, sessionError, login, registerDirector, registerStudent, registerEnrolledStudent, registerParent, changePassword, createStaffAccount, refresh, logout }),
    [user, loadingSession, sessionChecked, hasSession, justLoggedOut, sessionError, login, registerDirector, registerStudent, registerEnrolledStudent, registerParent, changePassword, createStaffAccount, refresh, logout],
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
