// Notifications temporaires visibles partout dans l'application.
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { ToastTone } from "@/components/ui/Toast";

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Fournit la fonction toast() sans rien afficher.
 *
 * Les appels à toast() sont conservés un peu partout dans l'application, mais
 * l'utilisateur ne souhaite plus voir ces petites notifications (accueil,
 * connexion, actions…). Le fournisseur reste en place pour que useToast()
 * continue de fonctionner ; seul l'affichage est désactivé. Pour réactiver les
 * notifications, il suffit de restaurer la pile et le <ToastViewport />.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const toast = useCallback((_message: string, _tone?: ToastTone) => {
    // Volontairement vide : aucun pop-up n'est affiché.
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

// Raccourci pour afficher une notification depuis n'importe quel composant.
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé dans <ToastProvider>.");
  return ctx;
}
