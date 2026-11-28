// Garde de route : quand le mode maintenance est activé par l'administrateur
// dans /admin/parametres, tous les utilisateurs non-admin sont redirigés vers
// la page de maintenance (/maintenance). Les pages de connexion, d'inscription
// et la console admin restent accessibles.
// Symétrie indispensable : quand la maintenance est DÉSACTIVÉE, un visiteur
// resté sur /maintenance est ramené à l'accueil (sinon un simple F5 sur cette
// URL réaffiche l'écran de maintenance même après désactivation).
import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { usePlatformStatus } from "@/context/PlatformContext";

// Chemins qui restent accessibles même en maintenance (hors /maintenance,
// géré explicitement ci-dessous dans les deux sens).
const ALLOWED_PATHS = [
  "/connexion",
  "/inscription",
  "/inscription/premium",
  "/inscription-envoyee",
  "/mot-de-passe-oublie",
  "/reinitialiser-mot-de-passe",
];

export function MaintenanceGuard() {
  const { status, loading } = usePlatformStatus();
  const { pathname } = useLocation();

  // Le défaut est maintenanceMode=false : on attend la réponse réelle avant
  // de rediriger, sinon on provoquerait un aller-retour /maintenance ↔ /.
  if (loading) return <Outlet />;

  if (!status.maintenanceMode) {
    // Sortie du piège : l'URL /maintenance seule ne doit jamais afficher
    // l'écran de maintenance quand le mode est désactivé.
    if (pathname === "/maintenance") return <Navigate to="/" replace />;
    return <Outlet />;
  }

  // La console admin est toujours accessible (c'est depuis là qu'on active/désactive).
  if (pathname.startsWith("/admin")) return <Outlet />;

  // Les pages d'auth restent accessibles ; /maintenance est la cible.
  if (ALLOWED_PATHS.includes(pathname) || pathname === "/maintenance") return <Outlet />;

  return <Navigate to="/maintenance" replace />;
}

/**
 * Surveille les changements de statut survenus APRÈS le premier rendu.
 * Monté globalement dans App.tsx (il était défini mais jamais branché).
 * Gère les deux directions : activation ET désactivation.
 */
export function MaintenanceWatcher() {
  const { status, loading } = usePlatformStatus();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (status.maintenanceMode) {
      if (pathname.startsWith("/admin") || ALLOWED_PATHS.includes(pathname) || pathname === "/maintenance") return;
      navigate("/maintenance", { replace: true });
      return;
    }
    if (pathname === "/maintenance") navigate("/", { replace: true });
  }, [loading, status.maintenanceMode, pathname, navigate]);

  return null;
}
