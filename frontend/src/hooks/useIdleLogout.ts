// Déconnexion automatique après inactivité : chaque geste de l'utilisateur relance le compte à rebours.
import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/**
 * Déconnexion automatique après une période d'inactivité.
 * Le délai est configuré dans /admin/parametres (session_timeout_minutes).
 * ATTENTION : ce garde-fou est une protection UX (éviter une session ouverte
 * indéfiniment sur un poste partagé). Il ne remplace PAS la révocation du JWT
 * côté serveur ni les RLS, et il ne doit JAMAIS désactiver la déconnexion.
 */
export function useIdleLogout(timeoutMinutes: number, onTimeout: () => void) {
  const callback = useRef(onTimeout);
  callback.current = onTimeout;

  useEffect(() => {
    const requested = Number(timeoutMinutes);
    // Valeur invalide ou nulle : on borne à 1 minute au lieu de désactiver
    // silencieusement le timeout (un réglage 0 laissait la session ouverte).
    const minutes = Number.isFinite(requested) && requested > 0 ? Math.max(1, requested) : 1;

    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.current(), minutes * 60_000);
    };

    schedule();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, schedule, { passive: true });
    }
    return () => {
      window.clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, schedule);
      }
    };
  }, [timeoutMinutes]);
}
