// Bandeau affiché quand certaines données n'ont pas pu être chargées au
// démarrage de la session (échec d'hydratation db.ts) : l'utilisateur voit
// pourquoi les listes sont vides et peut relancer le chargement.
import { useCallback, useEffect, useState } from "react";
import { clearHydrationFailures, getHydrationFailures, hydrateAll } from "@/services/db";
import { Icon } from "@/components/ui/Icon";

export function HydrationBanner({ className }: { className?: string }) {
  const [failures, setFailures] = useState<Map<string, string>>(new Map());
  const [retrying, setRetrying] = useState(false);

  const sync = useCallback(() => setFailures(getHydrationFailures()), []);

  useEffect(() => {
    sync();
    window.addEventListener("ec:hydration", sync);
    return () => window.removeEventListener("ec:hydration", sync);
  }, [sync]);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await hydrateAll();
    } finally {
      setRetrying(false);
      sync();
    }
  }, [sync]);

  if (!failures.size) return null;

  return (
    <div
      role="alert"
      className={`mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900 ${className ?? ""}`}
    >
      <Icon name="cloud_off" fill className="mt-0.5 shrink-0 text-[22px]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Certaines données n'ont pas pu être chargées</p>
        <p className="mt-0.5 text-sm text-rose-800">
          Les informations affichées peuvent être incomplètes (connexion réseau ou serveur). Les listes vides ne
          signifient pas qu'il n'y a rien — réessayez le chargement.
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying}
          className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60"
        >
          {retrying ? "Chargement…" : "Réessayer"}
        </button>
        <button
          type="button"
          onClick={() => {
            clearHydrationFailures();
            setFailures(new Map());
          }}
          className="text-xs font-semibold text-rose-700 underline"
        >
          Masquer
        </button>
      </div>
    </div>
  );
}
