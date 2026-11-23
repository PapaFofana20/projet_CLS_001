/**
 * S'abonne en temps réel aux notes de l'école courante.
 * Quand une note est saisie ou modifiée, recharge le cache db "grades".
 *
 * À utiliser dans les composants qui affichent un relevé de notes,
 * une grille de saisie ou un bulletin.
 */

import { useSchool } from "@/context/SchoolContext";
import { hydrate } from "@/services/db";
import { useRealtime } from "./useRealtime";

export function useRealtimeGrades(enabled = true) {
  const { schoolId } = useSchool();

  useRealtime(
    "grades",
    `school_id=eq.${schoolId}`,
    (payload) => {
      if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
        void hydrate("grades");
        window.dispatchEvent(new CustomEvent("ec:grade-changed", { detail: payload }));
      }
    },
    { events: ["INSERT", "UPDATE"], enabled: enabled && Boolean(schoolId) },
  );
}
