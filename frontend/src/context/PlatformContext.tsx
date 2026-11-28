// Réglages globaux de la plateforme : maintenance, support, nom affiché.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_PLATFORM_STATUS, getPlatformStatus } from "@/services/platform";
import type { PlatformStatus } from "@/types";

interface PlatformContextValue {
  status: PlatformStatus;
  loading: boolean;
  /** Recharge les réglages (après une modification dans /admin/parametres). */
  refresh: () => Promise<void>;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

// Charge le statut au démarrage, puis le resynchronise régulièrement et à
// chaque retour sur l'onglet (visibilitychange / pageshow / focus). Sur mobile,
// un simple F5 doit refléter immédiatement une désactivation de la maintenance.
export function PlatformProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PlatformStatus>(DEFAULT_PLATFORM_STATUS);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    // Évite deux requêtes concurrentes (polling + visibilitychange + admin).
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await getPlatformStatus();
      if (mounted.current) setStatus(next);
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Plus de requestIdleCallback différé : l'état de maintenance doit être
    // connu avant que l'utilisateur n'ait un comportement « en deux temps ».
    void refresh();

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => void refresh();
    const onPlatformChanged = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    // pageshow couvre le retour depuis le BFCache sur iOS/Android : le JS n'est
    // pas rechargé, seule la page est restaurée.
    window.addEventListener("pageshow", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("platform:status-changed", onPlatformChanged);

    // Filet de sécurité pour les onglets restés ouverts. 60 s et uniquement
    // quand l'onglet est visible : même avec plusieurs onglets, on reste très
    // en dessous de la limite de 60 req / 5 min du rate limit de l'endpoint.
    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);

    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("platform:status-changed", onPlatformChanged);
      window.clearInterval(pollId);
    };
  }, [refresh]);

  const value = useMemo(() => ({ status, loading, refresh }), [status, loading, refresh]);
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

// Lit le statut de la plateforme (maintenance, contacts…) depuis n'importe quel composant.
export function usePlatformStatus(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error("usePlatformStatus doit être utilisé dans <PlatformProvider>.");
  return ctx;
}
