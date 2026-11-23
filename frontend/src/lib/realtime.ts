/**
 * Helpers Realtime Supabase pour les tables scolaires.
 *
 * Chaque helper s'abonne aux changements d'une table, filtrés par school_id,
 * pour que chaque utilisateur ne reçoive que les données de SON école.
 *
 * ⚠️ PRÉREQUIS : la réplication doit être activée sur chaque table côté
 * Supabase (voir fichier SQL ci-dessous). Sans cela, les abonnements
 * restent silencieux.
 */

import { supabase } from "@/lib/supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/** S'abonne aux changements d'une table pour une école donnée. Retourne le canal (à fermer avec supabase.removeChannel). */
export function subscribeToTable(
  table: string,
  schoolId: string,
  onChange: (payload: RealtimePostgresChangesPayload<any>) => void,
  events: ("INSERT" | "UPDATE" | "DELETE")[] = ["INSERT", "UPDATE", "DELETE"],
): RealtimeChannel {
  const channel = supabase.channel(`realtime:${table}:${schoolId}`);
  const filter = `school_id=eq.${schoolId}`;

  events.forEach((event) => {
    channel.on(
      "postgres_changes",
      { event, schema: "public", table, filter },
      (payload) => onChange(payload),
    );
  });

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      // eslint-disable-next-line no-console
      console.log(`[realtime] abonné à ${table} pour l'école ${schoolId}`);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      // eslint-disable-next-line no-console
      console.error(`[realtime] échec d'abonnement à ${table} : ${status}`);
    }
  });

  return channel;
}

/** Ferme un canal Realtime proprement. */
export function unsubscribe(channel: RealtimeChannel): void {
  supabase.removeChannel(channel);
}

/* ------------------------------------------------------------------ */
/* Helpers par table                                                  */
/* ------------------------------------------------------------------ */

/** Nouvelle absence saisie (surveillant/direction) ou appel d'un enseignant. */
export function subscribeToAbsences(
  schoolId: string,
  onChange: (payload: RealtimePostgresChangesPayload<any>) => void,
) {
  return subscribeToTable("absences", schoolId, onChange, ["INSERT", "UPDATE"]);
}

/** Nouvelle note saisie (enseignant). */
export function subscribeToGrades(
  schoolId: string,
  onChange: (payload: RealtimePostgresChangesPayload<any>) => void,
) {
  return subscribeToTable("grades", schoolId, onChange, ["INSERT", "UPDATE"]);
}

/** Nouvelle annonce publiée (direction/économe). */
export function subscribeToAnnouncements(
  schoolId: string,
  onChange: (payload: RealtimePostgresChangesPayload<any>) => void,
) {
  return subscribeToTable("announcements", schoolId, onChange, ["INSERT"]);
}

/** Nouveau message dans une conversation (parents/enseignants). */
export function subscribeToMessages(
  schoolId: string,
  onChange: (payload: RealtimePostgresChangesPayload<any>) => void,
) {
  return subscribeToTable("messages", schoolId, onChange, ["INSERT"]);
}

/** Modification d'emploi du temps (direction). */
export function subscribeToTimetables(
  schoolId: string,
  onChange: (payload: RealtimePostgresChangesPayload<any>) => void,
) {
  return subscribeToTable("timetables", schoolId, onChange, ["INSERT", "UPDATE", "DELETE"]);
}

/** Modification d'un cours d'emploi du temps (direction). */
export function subscribeToTimetableCourses(
  schoolId: string,
  onChange: (payload: RealtimePostgresChangesPayload<any>) => void,
) {
  return subscribeToTable("timetable_courses", schoolId, onChange, ["INSERT", "UPDATE", "DELETE"]);
}
