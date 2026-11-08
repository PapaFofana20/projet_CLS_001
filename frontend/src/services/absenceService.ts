import type { AbsenceRecord } from "@/types";
import { supabase } from "@/lib/supabase";
import { subscriptionInfoOf } from "./subscriptionService";
import { absencesOf, classesOf, hydrate, studentsOf, subjectsOf } from "./db";

// Absences des élèves : lecture et ajout (table absences).

export interface AbsenceRow extends AbsenceRecord {
  studentName: string;
  className: string;
  subjectName: string | null;
}

// Récupère les absences d'une école, avec le nom de l'élève, sa classe et la matière du cours.
export function listAbsences(schoolId: string): Promise<AbsenceRow[]> {
  return (async () => {
    await hydrate("absences");
    const classes = classesOf(schoolId);
    const subjects = subjectsOf(schoolId);
    return absencesOf(schoolId).map((a) => {
      const s = studentsOf(schoolId).find((x) => x.id === a.studentId);
      return {
        ...a,
        studentName: s ? `${s.firstName} ${s.lastName}` : "—",
        className: classes.find((c) => c.id === s?.classId)?.name ?? "—",
        subjectName: a.subjectId ? (subjects.find((x) => x.id === a.subjectId)?.name ?? null) : null,
      };
    });
  })();
}

// Ajoute une absence dans la table absences, puis recharge le cache.
export function addAbsence(schoolId: string, input: Omit<AbsenceRecord, "id" | "schoolId">): Promise<AbsenceRecord> {
  return (async () => {
    const info = subscriptionInfoOf(schoolId);
    // Bloque l'ajout en lecture seule (abonnement expiré).
    if (info.status === "EXPIRE" && info.readOnly) {
      throw new Error("Mode lecture seule : l'abonnement de votre école est expiré. Les modifications sont désactivées.");
    }
    const { error } = await supabase
      .from("absences")
      .insert({
        school_id: schoolId,
        student_id: input.studentId,
        absence_date: input.date,
        absence_type: input.type,
        motif: input.motif.trim(),
        justified: input.justified,
        ...(input.sanction?.trim() ? { sanction: input.sanction.trim() } : {}),
      });
    if (error) throw new Error(error.message);
    await hydrate("absences");
    const latest = absencesOf(schoolId).find(
      (a) => a.studentId === input.studentId && a.date === input.date && a.type === input.type && a.motif === input.motif.trim(),
    );
    return latest ?? { ...input, id: "", schoolId };
  })();
}
