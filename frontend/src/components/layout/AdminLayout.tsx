// Mise en page de la console admin : sidebar, topbar et déconnexion auto après inactivité.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/context/SidebarContext";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";
import { MaintenanceBanner } from "./MaintenanceBanner";
import { HydrationBanner } from "./HydrationBanner";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { usePlatformStatus } from "@/context/PlatformContext";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import { usePageMeta } from "@/hooks/usePageMeta";
import { SuspenseOutlet } from "@/components/ui/PageSuspense";

// Assemblage des colonnes et du bandeau de maintenance.
function Shell() {
  const { agent, logout } = useAdminAuth();
  const { status } = usePlatformStatus();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);

  useIdleLogout(status.sessionTimeoutMinutes, () => {
    void logout();
    navigate("/admin/connexion", { replace: true });
  });

  if (!agent) return null; // géré par AdminAuthWrapper / redirection
  return (
    <div className="min-h-screen bg-mist">
      <button type="button" onClick={() => document.getElementById("contenu-admin")?.focus()} className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-lime focus:px-4 focus:py-2">
        Aller au contenu
      </button>
      <div className="mx-auto flex w-full max-w-[1920px] items-start">
        <AdminSidebar agent={agent} drawerOpen={drawer} onClose={() => setDrawer(false)} />
        <div className="min-w-0 flex-1 overflow-x-clip px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:pb-10">
          <AdminTopbar agent={agent} onMenu={() => setDrawer(true)} onLogout={logout} />
          <MaintenanceBanner />
          <HydrationBanner />
          {/* Pas de key={pathname} : il remontait toute la page à chaque clic
              (perte d'état, skeletons et refetch systématiques). Le défilement
              en haut de page est déjà géré par ScrollToTop dans App.tsx. */}
          <main id="contenu-admin" tabIndex={-1} className="min-w-0 focus:outline-none">
            <SuspenseOutlet />
          </main>
        </div>
      </div>
    </div>
  );
}

// Layout admin : fournit l'état de la sidebar repliable.
export function AdminLayout() {
  // Console d'administration : jamais proposée aux moteurs de recherche.
  usePageMeta({ noindex: true });
  return (
    <SidebarProvider>
      <Shell />
    </SidebarProvider>
  );
}