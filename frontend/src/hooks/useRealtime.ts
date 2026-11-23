/**
 * Hook Realtime Supabase : s'abonne aux changements d'une table (INSERT/UPDATE/DELETE)
 * filtrés par school_id, afin que chaque utilisateur ne reçoive que les données
 * de SON école (RLS respected par Supabase Realtime).
 *
 * Le callback reçoit le payload Supabase { eventType, schema, table, commit_timestamp, new, old }.
 *
 * Usage :
 *   useRealtime("absences", `school_id=eq.${schoolId}`, (payload) => {
 *     if (payload.eventType === "INSERT") void hydrate("absences");
 *   });
 *
 * Le canal est proprement fermé au démontage du composant.
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export function useRealtime(
  table: string,
  filter: string,
  callback: (payload: RealtimePostgresChangesPayload<any>) => void,
  options?: {
    events?: ("INSERT" | "UPDATE" | "DELETE")[];
    enabled?: boolean;
  },
) {
  const { events = ["INSERT", "UPDATE", "DELETE"], enabled = true } = options ?? {};
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return undefined;

    const channel = supabase.channel(`realtime:${table}`);

    events.forEach((event) => {
      channel.on(
        "postgres_changes",
        { event, schema: "public", table, filter },
        (payload) => {
          callbackRef.current(payload);
        },
      );
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // eslint-disable-next-line no-console
        console.log(`[realtime] abonné à ${table} (${filter})`);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // eslint-disable-next-line no-console
        console.error(`[realtime] erreur d'abonnement à ${table} : ${status}`);
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, filter, enabled, ...events]);

  return channelRef.current;
}
