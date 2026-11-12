// Gardes de route de l'espace école : connexion, rôles, mot de passe et abonnement.
import { useEffect, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useSchool } from "@/context/SchoolContext";
import type { Role } from "@/types";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { isAlwaysAllowed } from "./navigation";
import { ContactSchoolScreen, RenewScreen, SubscriptionRequiredScreen } from "@/features/subscription/SubscriptionScreens";
import { usePageMeta } from "@/hooks/usePageMeta";
import { logout } from "@/services/authService";
import { useIdleLogout } from "@/hooks/useIdleLogout";

/** Écran de chargement de session : spinner + libellé (au lieu d'un écran blanc). */
// Affiche une attente claire pendant que la session se restaure.
export function SessionLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-mist p-4" role="status" aria-label="Chargement de votre session">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="size-10 animate-spin rounded-full border-4 border-forest/15 border-t-forest" aria-hidden="true" />
        <p className="text-sm font-semibold text-forest">Chargement de votre session…</p>
      </div>
    </div>
  );
}

/** /app/* : redirige vers /connexion si non connecté. */
export function ProtectedRoute() {
  const { user, justLoggedOut, loadingSession } = useAuth();
  const location = useLocation();
  // Restauration de session en cours : ne PAS rediriger — au rechargement
  // direct d'un lien profond, user est encore null et la redirection vers
  // /connexion détruisait l'URL d'origine.
  // Écran de chargement explicite (et non une page blanche) : l'utilisateur
  // doit voir que la session se restaure, surtout au premier chargement.
  if (loadingSession) return <SessionLoading />;
  if (!user) return <Navigate to={justLoggedOut ? "/" : "/connexion"} replace state={{ from: location.pathname }} />;
  if (user.status === "DESACTIVE") {
    // Ceinture et bretelles : currentSession() fermant déjà la session d'un
    // compte désactivé, ce cas ne devrait plus se présenter — on évince
    // néanmoins tout user muet qui resterait en mémoire plutôt que servir
    // l'application à un compte désactivé. (EN_ATTENTE est géré par la
    // demande d'inscription côté écran d'accueil, pas par une redirection.)
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

/** /connexion, /inscription : redirige vers /app si déjà connecté. */
export function PublicOnlyRoute() {
  const { user, loadingSession, sessionChecked, hasSession } = useAuth();
  // Hooks AVANT tout return conditionnel (ordre stable des hooks).
  usePageMeta({ noindex: true });
  if (user) return <Navigate to="/app" replace />;
  // Visiteur sans jeton local : la page s'affiche aussitôt, sans attendre
  // l'hydratation complète des données de l'école (réservée à /app).
  if (sessionChecked && !hasSession) return <Outlet />;
  // Jeton présent mais profil pas encore restauré : on attend, puis on
  // redirigera vers /app (évite le flash du formulaire).
  if (loadingSession) return <SessionLoading />;
  return <Outlet />;
}

/** Restreint une page à certains rôles. */
export function RoleRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) {
    return (
      <EmptyState
        icon="lock"
        title="Accès non autorisé"
        text="Votre rôle ne permet pas de consulter cette page."
        action={
          <LinkButton to="/app" variant="dark">
            Retour au tableau de bord
          </LinkButton>
        }
      />
    );
  }
  return <>{children}</>;
}

/** Mot de passe temporaire : changement obligatoire avant tout accès à l'application. */
export function MustChangePasswordGuard() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (!user) return <Navigate to="/connexion" replace />;
  if (user.mustChangePassword && pathname !== "/app/mot-de-passe-temporaire") {
    return <Navigate to="/app/mot-de-passe-temporaire" replace />;
  }
  if (!user.mustChangePassword && pathname === "/app/mot-de-passe-temporaire") return <Navigate to="/app" replace />;
  return <Outlet />;
}

/**
 * Verrou d'abonnement ACTIF (audit strict 08/11/2026 : il était désactivé,
 * ce qui rendait tout le système d'abonnement inerte — une école expirée
 * accédait à tout). La base exige un abonnement actif pour écrire
 * (school_is_writable, migration 00021) : la garde UI est alignée.
 * Les écrans de blocage (RenewScreen, ContactSchoolScreen,
 * SubscriptionRequiredScreen) se remontent automatiquement.
 * Le guard est TOUJOURS actif — le backend (RLS) est la source de vérité.
 */
export function SubscriptionGuard() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const school = useSchool();

  // Déconnexion automatique après 30 minutes d'inactivité (M-07 de l'audit).
  // Délai par défaut : 30 min — à rendre configurable via settings.session_timeout_minutes.
  useIdleLogout(30, () => {
    logout();
    window.location.replace("/connexion");
  });

  if (isAlwaysAllowed(pathname)) return <Outlet />;
  // Tant que l'abonnement n'est pas chargé, on laisse la page afficher ses skeletons.
  if (school.loading) return <Outlet />;

  if (school.blocked && school.schoolId) {
    return user?.role === "directeur" ? <RenewScreen schoolName={school.schoolName} status={school.status} isDirector /> : <ContactSchoolScreen schoolName={school.schoolName} />;
  }
  if (school.missing && school.schoolId) return <SubscriptionRequiredScreen schoolName={school.schoolName} />;
  return <Outlet />;
}

// Remonte en haut de page à chaque changement de route, sans animation.
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}
