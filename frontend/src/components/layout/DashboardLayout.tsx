// Mise en page de l'espace privé : sidebar, topbar et contenu des pages.
import { useState } from "react";
import { ChildProvider } from "@/context/ChildContext";
import { useCurrentUser } from "@/context/AuthContext";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { TeachingProvider } from "@/context/TeachingContext";
import { SubscriptionBanner } from "@/features/subscription/SubscriptionBanner";
import { MaintenanceBanner } from "./MaintenanceBanner";
import { HydrationBanner } from "./HydrationBanner";
import { usePageMeta } from "@/hooks/usePageMeta";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { SuspenseOutlet } from "@/components/ui/PageSuspense";

// Assemblage des deux colonnes et des bandeaux au-dessus du contenu.
function Shell() {
  const user = useCurrentUser();
  const { registerContent } = useSidebar();
  const [drawer, setDrawer] = useState(false);
  return (
    <div className="min-h-screen bg-mist">
      <button type="button" onClick={() => document.getElementById("contenu")?.focus()} className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-lime focus:px-4 focus:py-2">
        Aller au contenu
      </button>
      {/* Deux colonnes dans le flux : la sidebar pousse le contenu, elle ne le recouvre jamais. */}
      <div className="mx-auto flex w-full max-w-[1920px] items-start">
        <Sidebar user={user} drawerOpen={drawer} onClose={() => setDrawer(false)} />
        <div ref={registerContent} className="@container min-w-0 flex-1 overflow-x-clip px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:pb-10">
          <Topbar user={user} onMenu={() => setDrawer(true)} />
          {/* Pas de key={pathname} : il remontait toute la page à chaque clic
              (perte d'état, skeletons et refetch systématiques). Le défilement
              en haut de page est déjà géré par ScrollToTop dans App.tsx. */}
          <main id="contenu" tabIndex={-1} className="min-w-0 focus:outline-none">
            <MaintenanceBanner />
            <HydrationBanner />
            <SubscriptionBanner />
            <SuspenseOutlet />
          </main>
        </div>
      </div>
      <BottomNav user={user} />
    </div>
  );
}

// Layout public : ajoute les fournisseurs d'état de l'espace privé.
export function DashboardLayout() {
  // Espace scolaire privé : jamais proposé aux moteurs de recherche.
  usePageMeta({ noindex: true });
  return (
    <SidebarProvider>
      <TeachingProvider>
        <ChildProvider>
          <Shell />
        </ChildProvider>
      </TeachingProvider>
    </SidebarProvider>
  );
}