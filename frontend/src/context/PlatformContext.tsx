// Réglages globaux de la plateforme : maintenance, support, nom affiché.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_PLATFORM_STATUS, getPlatformStatus } from "@/services/platform";
import type { PlatformStatus } from "@/types";

interface PlatformContextValue {
  status: PlatformStatus;
  loading: boolean;
  /** Recharge les réglages (après une modification dans /admin/parametres). */
  refresh: () => Promise<void>;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

// Charge les réglages une fois au démarrage, rechargeables à la demande.
export function PlatformProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PlatformStatus>(DEFAULT_PLATFORM_STATUS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await getPlatformStatus();
    setStatus(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const load = () => {
      getPlatformStatus().then((next) => {
        if (!cancelled) {
          setStatus(next);
          setLoading(false);
        }
      });
    };
    // Chargé après le premier rendu : cet appel réseau (API Render) ne doit pas
    // concurrencer les ressources critiques de la page. Le statut par défaut
    // (aucune maintenance) s'applique en attendant.
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(load, { timeout: 2000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }
    timeoutId = window.setTimeout(load, 1200);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  const value = useMemo(() => ({ status, loading, refresh }), [status, loading, refresh]);
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

// Lit le statut de la plateforme (maintenance, contacts…) depuis n'importe quel composant.
export function usePlatformStatus(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("usePlatformStatus doit être utilisé dans <PlatformProvider>.");
  return ctx;
}
