// Garde de route : quand le mode maintenance est activé par l'administrateur
// dans /admin/parametres, tous les utilisateurs non-admin sont redirigés vers
// la page de maintenance (/maintenance). Les pages de connexion, d'inscription
// et la console admin restent accessibles.
import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { usePlatformStatus } from "@/context/PlatformContext";

// Chemins qui restent accessibles même en maintenance.
const ALLOWED_PATHS = [
  "/connexion",
  "/inscription",
  "/inscription/premium",
  "/inscription-envoyee",
  "/mot-de-passe-oublie",
  "/reinitialiser-mot-de-passe",
  "/maintenance",
];

export function MaintenanceGuard() {
  const { status } = usePlatformStatus();
  const { pathname } = useLocation();

  // Si la maintenance n'est pas activée, on laisse passer normalement.
  if (!status.maintenanceMode) return <Outlet />;

  // La console admin est toujours accessible (c'est depuis là qu'on active/désactive).
  if (pathname.startsWith("/admin")) return <Outlet />;

  // Les pages d'auth et la page de maintenance elle-même restent accessibles.
  if (ALLOWED_PATHS.includes(pathname)) return <Outlet />;

  // Redirection vers la page de maintenance.
  return <Navigate to="/maintenance" replace />;
}

/**
 * Effet de surveillance : si le statut de la plateforme change après le
 * premier rendu (chargement asynchrone de PlatformContext) et que le mode
 * maintenance devient actif, on redirige immédiatement vers /maintenance.
 * Cela évite de rester sur une page alors que la maintenance vient d'être
 * activée par l'admin.
 */
export function MaintenanceWatcher() {
  const { status } = usePlatformStatus();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!status.maintenanceMode) return;
    if (pathname.startsWith("/admin")) return;
    if (ALLOWED_PATHS.includes(pathname)) return;
    window.location.replace("/maintenance");
  }, [status.maintenanceMode, pathname]);

  return null;
}
