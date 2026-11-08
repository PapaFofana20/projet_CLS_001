import type { SessionUser } from "@/types";
import { supabase } from "@/lib/supabase";
import { hydrate } from "./db";
import { ensure } from "./access";

// Présences : appel d'une classe (classe · matière · date) via la RPC
// set_attendance. Les élèves non listés sont présents ; l'appel est
// enregistré immédiatement (pas d'attente de 24 h) et visible aussitôt
// par la direction et le surveillant.

export type AttendanceMark = "present" | "absence" | "retard";

export interface AttendanceSummary {
  classId: string;
  subjectId: string | null;
  date: string;
  absent: number;
  retard: number;
  present: number;
}

/**
 * Enregistre l'appel d'une classe : `marks` ne contient que les élèves
 * non présents (absence / retard). Remplace l'appel précédent du même jour.
 */
export function setAttendance(
  actor: SessionUser,
  classId: string,
  subjectId: string | null,
  date: string,
  marks: { studentId: string; type: "absence" | "retard" }[],
): Promise<AttendanceSummary> {
  return (async () => {
    ensure(!!actor.schoolId, "Aucune école associée à ce compte.");
    const { data, error } = await supabase.rpc("set_attendance", {
      p_class_id: classId,
      p_subject_id: subjectId || null,
      p_date: date,
      p_records: marks,
    });
    if (error) {
      if (error.message.includes("pas affecté")) throw new Error("Vous n'êtes pas affecté à cette classe.");
      if (error.message.includes("date future")) throw new Error("Impossible de saisir une présence pour une date future.");
      if (error.message.includes("lecture seule")) throw new Error("Mode lecture seule : l'abonnement de votre école est expiré.");
      if (error.message.includes("n'appartient pas")) throw new Error("Un élève n'appartient pas à cette classe.");
      if (error.message.includes("Classe introuvable")) throw new Error("Classe introuvable dans votre école.");
      throw new Error("Enregistrement impossible. Réessayez.");
    }
    await hydrate("absences");
    const d = (data ?? {}) as Record<string, unknown>;
    ensure(typeof d.present === "number", "Réponse serveur incomplète.");
    return {
      classId: String(d.class_id ?? classId),
      subjectId: (d.subject_id as string | null) ?? subjectId,
      date: String(d.date ?? date),
      absent: Number(d.absent ?? 0),
      retard: Number(d.retard ?? 0),
      present: Number(d.present ?? 0),
    };
  })();
}
