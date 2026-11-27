import type { ClassRoom, Period, ReportCardData, ReportMeta, SessionUser } from "@/types";
import { getPeriods } from "@/data/school";
import { buildClassReportCards } from "@/utils/reportCard";
import { isHeadTeacher } from "@/utils/permissions";
import { supabase } from "@/lib/supabase";
import { ensure, ensureWritable, teacherOf } from "./access";
import { assignmentsOf, classesOf, classSubjectsOf, db, gradesOf, hydrate, parentsOf, reportMetasOf, respond, settingsOf, studentsOf, subjectsOf, teachersOf } from "./db";

// Bulletins : calcul à partir des notes (grades) et des mentions (report_metas).

// Périodes de l'école selon son découpage (semestre ou trimestre).
export function currentPeriods(schoolId: string): Period[] {
  return getPeriods(settingsOf(schoolId).periodType);
}

/** Calcul pur des bulletins d'une classe (utilisé aussi par la fiche élève). */
export function cardsForClass(classId: string, periodId: string): ReportCardData[] {
  const classRoom = db.classes.find((c) => c.id === classId);
  if (!classRoom) return [];
  const schoolId = classRoom.schoolId;
  const periods = currentPeriods(schoolId);
  const period = periods.find((p) => p.id === periodId) ?? periods[0];
  if (!period) return [];
  return buildClassReportCards({
    classRoom,
    students: studentsOf(schoolId).filter((s) => s.classId === classId),
    grades: gradesOf(schoolId),
    classSubjects: classSubjectsOf(schoolId),
    subjects: subjectsOf(schoolId),
    assignments: assignmentsOf(schoolId),
    teachers: teachersOf(schoolId),
    metas: reportMetasOf(schoolId),
    period,
  });
}

function classAllowed(actor: SessionUser, classRoom: ClassRoom): boolean {
  if (classRoom.schoolId !== actor.schoolId) return false;
  if (actor.role === "directeur" || actor.role === "econome") return true;
  // Un élève ne peut consulter QUE la classe de son propre dossier : l'ancien
  // `return true` le laissait choisir n'importe quelle classe de l'école et
  // aboutissait à un bulletin vide (les cartes sont filtrées sur studentId).
  if (actor.role === "eleve") {
    const own = studentsOf(actor.schoolId).find((s) => s.id === actor.studentId);
    return !!own && own.classId === classRoom.id;
  }
  if (actor.role === "instituteur" || actor.role === "professeur") return isHeadTeacher(teacherOf(actor), classRoom);
  if (actor.role === "parent") return studentsOf(actor.schoolId).some((s) => s.classId === classRoom.id && s.parentId === actor.parentId);
  return false;
}

/** Classes pour lesquelles l'acteur peut consulter la synthèse / les bulletins. */
export function bulletinClasses(actor: SessionUser): Promise<ClassRoom[]> {
  return respond(() => classesOf(actor.schoolId).filter((c) => classAllowed(actor, c)));
}

// Bulletins d'une classe pour une période, filtrés selon qui regarde (parent, élève ou personnel).
export function getClassReportCards(actor: SessionUser, classId: string, periodId: string): Promise<ReportCardData[]> {
  return respond(() => {
    const classRoom = classesOf(actor.schoolId).find((c) => c.id === classId);
    ensure(!!classRoom && classAllowed(actor, classRoom), "Vous n'avez pas accès aux bulletins de cette classe.");
    const cards = cardsForClass(classId, periodId);
    if (actor.role === "parent") return cards.filter((c) => c.student.parentId === actor.parentId);
    if (actor.role === "eleve") return cards.filter((c) => c.student.id === actor.studentId);
    return cards;
  });
}

export function updateReportMeta(actor: SessionUser, studentId: string, periodId: string, patch: Partial<Pick<ReportMeta, "conduct" | "comment" | "absences">>): Promise<ReportMeta> {
  return (async () => {
    ensureWritable(actor);
    const student = studentsOf(actor.schoolId).find((s) => s.id === studentId);
    const classRoom = student ? classesOf(actor.schoolId).find((c) => c.id === student.classId) : undefined;
    ensure(!!classRoom && actor.role !== "parent" && classAllowed(actor, classRoom), "Modification non autorisée.");
    const { error } = await supabase.rpc("update_report_meta", {
      p_student_id: studentId,
      p_period: periodId,
      p_conduct: patch.conduct ?? null,
      p_absences: patch.absences ?? null,
      p_comment: patch.comment ?? null,
    });
    if (error) throw new Error(/Modification non/.test(error.message) ? "Modification non autorisée." : error.message);
    // Relecture explicite de la ligne RPC : on ne reconstruit JAMAIS le résultat
    // depuis le patch (qui pourrait afficher une valeur non enregistrée).
    const { data: saved, error: readError } = await supabase
      .from("report_metas")
      .select("school_id, student_id, period, conduct, absences, comment")
      .eq("school_id", actor.schoolId)
      .eq("student_id", studentId)
      .eq("period", periodId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!saved) throw new Error("Enregistrement non confirmé : la mention n'a pas été retrouvée. Réessayez.");
    await hydrate("reportMetas");
    return {
      schoolId: actor.schoolId,
      studentId,
      period: periodId,
      conduct: saved.conduct ?? "",
      absences: Number(saved.absences ?? 0),
      comment: saved.comment ?? "",
    };
  })();
}

/** Périodes configurées (semestres ou trimestres) et période en cours de l'école. */
export function periodInfo(schoolId: string): { periods: Period[]; current: string } {
  return { periods: currentPeriods(schoolId), current: settingsOf(schoolId).currentPeriod };
}

/** Parent d'un élève (pour les fiches). */
export const parentOf = (schoolId: string, parentId: string) => parentsOf(schoolId).find((p) => p.id === parentId);