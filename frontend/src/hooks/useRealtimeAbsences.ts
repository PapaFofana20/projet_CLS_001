/**
 * S'abonne en temps réel aux absences de l'école courante.
 * Quand une absence est ajoutée ou modifiée, recharge le cache db "absences".
 *
 * À utiliser dans les composants qui affichent la liste des absences
 * (vie scolaire, tableau de bord, etc.).
 */

import { useSchool } from "@/context/SchoolContext";
import { hydrate } from "@/services/db";
import { useRealtime } from "./useRealtime";

export function useRealtimeAbsences(enabled = true) {
  const { schoolId } = useSchool();

  useRealtime(
    "absences",
    `school_id=eq.${schoolId}`,
    (payload) => {
      if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
        void hydrate("absences");
        // Notifie les abonnés UI qu'une absence a changé
        window.dispatchEvent(new CustomEvent("ec:absence-changed", { detail: payload }));
      }
    },
    { events: ["INSERT", "UPDATE"], enabled: enabled && Boolean(schoolId) },
  );
}
