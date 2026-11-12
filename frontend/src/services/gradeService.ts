import type { ClassRoom, Grade, SessionUser, Student, Subject } from "@/types";
import { canEditGrades, canReadSubject } from "@/utils/permissions";
import { gradeCompletion, subjectAverage, round2 } from "@/utils/grades";
import { getPeriods } from "@/data/school";
import { supabase } from "@/lib/supabase";
import { ensure, ensureWritable, teacherOf } from "./access";
import { assignmentsOf, classSubjectsOf, classesOf, gradesOf, hydrate, respond, settingsOf, studentsOf, subjectsOf } from "./db";
import { subscriptionInfoOf } from "./subscriptionService";

// Notes des élèves (table grades) : lecture du relevé et saisie devoir/composition.

export interface StudentGradeHistory {
  subjectId: string;
  subjectName: string;
  coefficient: number;
  periods: {
    periodId: string;
    periodLabel: string;
    devoir1: number | null;
    devoir2: number | null;
    composition: number | null;
    average: number | null;
  }[];
}

// Récupère l'historique complet des notes d'un élève pour toutes ses matières et toutes les périodes.
export function getStudentGradeHistory(actor: SessionUser, studentId: string): Promise<StudentGradeHistory[]> {
  return respond(() => {
    const student = studentsOf(actor.schoolId).find((s) => s.id === studentId);
    ensure(!!student, "Élève introuvable.");
    const classRoom = classesOf(actor.schoolId).find((c) => c.id === student!.classId);
    ensure(!!classRoom, "Classe introuvable.");
    const settings = settingsOf(actor.schoolId);
    const periods = getPeriods(settings.periodType);

    const classSubjects = classSubjectsOf(actor.schoolId).filter((cs) => cs.classId === classRoom!.id);
    const grades = gradesOf(actor.schoolId).filter((g) => g.studentId === studentId);

    return classSubjects.map((cs) => {
      const subject = subjectsOf(actor.schoolId).find((s) => s.id === cs.subjectId);
      return {
        subjectId: cs.subjectId,
        subjectName: subject?.name ?? cs.subjectId,
        coefficient: cs.coefficient,
        periods: periods.map((p) => {
          const g = grades.find((x) => x.subjectId === cs.subjectId && x.period === p.id);
          const avg = g ? subjectAverage(g, classRoom!.cycle) : null;
          return {
            periodId: p.id,
            periodLabel: p.label,
            devoir1: g?.devoir1 ?? null,
            devoir2: g?.devoir2 ?? null,
            composition: g?.composition ?? null,
            average: avg,
          };
        }),
      };
    });
  });
}

export interface GradeSheet {
  classRoom: ClassRoom;
  subject: Subject;
  coefficient: number;
  students: Student[];
  grades: Grade[];
  editable: boolean;
  /** Vrai si l'école est en lecture seule (abonnement expiré). */
  readOnly: boolean;
}

// Récupère le relevé (élèves + notes) d'une classe × matière pour une période.
export function getGradeSheet(actor: SessionUser, classId: string, subjectId: string, period: string): Promise<GradeSheet> {
  return respond(() => {
    const classRoom = classesOf(actor.schoolId).find((c) => c.id === classId);
    const subject = subjectsOf(actor.schoolId).find((s) => s.id === subjectId);
    if (!classRoom || !subject) throw new Error("Classe ou matière introuvable.");
    const teacher = teacherOf(actor);
    const editable = canEditGrades(teacher, classId, subjectId, assignmentsOf(actor.schoolId));
    ensure(actor.role === "directeur" || canReadSubject(teacher, classRoom, subjectId, assignmentsOf(actor.schoolId)), "Cette classe ou cette matière ne vous est pas affectée.");
    return {
      classRoom,
      subject,
      coefficient: classSubjectsOf(actor.schoolId).find((x) => x.classId === classId && x.subjectId === subjectId)?.coefficient ?? 1,
      students: studentsOf(actor.schoolId).filter((s) => s.classId === classId),
      grades: gradesOf(actor.schoolId).filter((g) => g.classId === classId && g.subjectId === subjectId && g.period === period),
      editable,
      readOnly: subscriptionInfoOf(actor.schoolId).readOnly,
    };
  });
}

export interface SaveGradeInput {
  studentId: string;
  classId: string;
  subjectId: string;
  period: string;
  field: "devoir1" | "devoir2" | "composition";
  value: number | null;
}

// Enregistre une note (devoir1, devoir2 ou composition) via le RPC serveur.
export function saveGrade(actor: SessionUser, input: SaveGradeInput): Promise<Grade> {
  return (async () => {
    ensureWritable(actor);
    ensure(canEditGrades(teacherOf(actor), input.classId, input.subjectId, assignmentsOf(actor.schoolId)), "Action non autorisée : cette classe ou cette matière ne vous est pas affectée.");
    ensure(studentsOf(actor.schoolId).some((s) => s.id === input.studentId), "Élève introuvable dans votre école.");
    ensure(input.value === null || (input.value >= 0 && input.value <= 20), "La note doit être comprise entre 0 et 20.");
    const { error } = await supabase.rpc("save_grade", {
      p_student_id: input.studentId,
      p_class_id: input.classId,
      p_subject_id: input.subjectId,
      p_period: input.period,
      p_field: input.field,
      p_value: input.value,
    });
    if (error) {
      if (/comprise entre 0 et 20/.test(error.message)) throw new Error("La note doit être comprise entre 0 et 20.");
      if (/ne vous est pas affectée/.test(error.message)) throw new Error("Action non autorisée : cette classe ou cette matière ne vous est pas affectée.");
      if (/introuvable/.test(error.message)) throw new Error("Élève introuvable dans votre école.");
      if (/lectur/.test(error.message)) throw new Error(error.message);
      throw new Error(error.message);
    }
    await hydrate("grades");
    const g = gradesOf(actor.schoolId).find(
      (x) => x.studentId === input.studentId && x.classId === input.classId && x.subjectId === input.subjectId && x.period === input.period,
    );
    return (
      g ?? {
        schoolId: actor.schoolId,
        studentId: input.studentId,
        classId: input.classId,
        subjectId: input.subjectId,
        period: input.period,
        devoir1: null,
        devoir2: null,
        composition: null,
      }
    );
  })();
}

export interface ContextOverview {
  classId: string;
  subjectId: string;
  className: string;
  subjectName: string;
  studentCount: number;
  completion: number;
  average: number | null;
}

// ------------------------------------------------------------------
// Historique des moyennes de classe par matière (pour enseignants)
// ------------------------------------------------------------------

export interface ClassSubjectGradeHistory {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  cycle: ClassRoom["cycle"];
  coefficient: number;
  periods: {
    periodId: string;
    periodLabel: string;
    average: number | null;
    studentCount: number;
    completion: number;
  }[];
}

/** Récupère l'évolution des moyennes de classe pour une classe × matière sur toutes les périodes. */
export function getClassSubjectGradeHistory(actor: SessionUser, classId: string, subjectId: string): Promise<ClassSubjectGradeHistory | null> {
  return respond(() => {
    const classRoom = classesOf(actor.schoolId).find((c) => c.id === classId);
    const subject = subjectsOf(actor.schoolId).find((s) => s.id === subjectId);
    if (!classRoom || !subject) return null;

    const teacher = teacherOf(actor);
    ensure(actor.role === "directeur" || canReadSubject(teacher, classRoom, subjectId, assignmentsOf(actor.schoolId)), "Accès non autorisé.");

    const settings = settingsOf(actor.schoolId);
    const periods = getPeriods(settings.periodType);
    const classSubject = classSubjectsOf(actor.schoolId).find((x) => x.classId === classId && x.subjectId === subjectId);
    const students = studentsOf(actor.schoolId).filter((s) => s.classId === classId);
    const studentIds = students.map((s) => s.id);
    const grades = gradesOf(actor.schoolId).filter((g) => g.classId === classId && g.subjectId === subjectId && studentIds.includes(g.studentId));

    return {
      classId,
      className: classRoom.name,
      subjectId,
      subjectName: subject.name,
      cycle: classRoom.cycle,
      coefficient: classSubject?.coefficient ?? 1,
      periods: periods.map((p) => {
        const periodGrades = grades.filter((g) => g.period === p.id);
        const avgs = periodGrades.map((g) => subjectAverage(g, classRoom.cycle)).filter((x): x is number => x !== null);
        const avg = avgs.length ? round2(avgs.reduce((x, y) => x + y, 0) / avgs.length) : null;
        const filled = periodGrades.reduce(
          (a, g) => a + (classRoom.cycle === "elementaire" ? (g.composition !== null ? 1 : 0) : [g.devoir1, g.devoir2, g.composition].filter((x) => x !== null).length),
          0,
        );
        const expected = studentIds.length * (classRoom.cycle === "elementaire" ? 1 : 3);
        const completion = expected ? Math.min(100, Math.round((filled / expected) * 100)) : 0;

        return {
          periodId: p.id,
          periodLabel: p.label,
          average: avg,
          studentCount: studentIds.length,
          completion,
        };
      }),
    };
  });
}

/** Récupère l'historique pour toutes les affectations d'un enseignant. */
export function getTeacherGradeHistory(actor: SessionUser): Promise<ClassSubjectGradeHistory[]> {
  return respond(() => {
    const teacherId = actor.teacherId ?? "";
    const my = assignmentsOf(actor.schoolId).filter((a) => a.teacherId === teacherId);
    const settings = settingsOf(actor.schoolId);
    const periods = getPeriods(settings.periodType);

    return my
      .map((a) => {
        const classRoom = classesOf(actor.schoolId).find((c) => c.id === a.classId);
        const subject = subjectsOf(actor.schoolId).find((s) => s.id === a.subjectId);
        if (!classRoom || !subject) return null;

        const classSubject = classSubjectsOf(actor.schoolId).find((x) => x.classId === a.classId && x.subjectId === a.subjectId);
        const students = studentsOf(actor.schoolId).filter((s) => s.classId === a.classId);
        const studentIds = students.map((s) => s.id);
        const grades = gradesOf(actor.schoolId).filter((g) => g.classId === a.classId && g.subjectId === a.subjectId && studentIds.includes(g.studentId));

        return {
          classId: a.classId,
          className: classRoom.name,
          subjectId: a.subjectId,
          subjectName: subject.name,
          cycle: classRoom.cycle,
          coefficient: classSubject?.coefficient ?? 1,
          periods: periods.map((p) => {
            const periodGrades = grades.filter((g) => g.period === p.id);
            const avgs = periodGrades.map((g) => subjectAverage(g, classRoom.cycle)).filter((x): x is number => x !== null);
            const avg = avgs.length ? round2(avgs.reduce((x, y) => x + y, 0) / avgs.length) : null;
            const filled = periodGrades.reduce(
              (acc, g) => acc + (classRoom.cycle === "elementaire" ? (g.composition !== null ? 1 : 0) : [g.devoir1, g.devoir2, g.composition].filter((x) => x !== null).length),
              0,
            );
            const expected = studentIds.length * (classRoom.cycle === "elementaire" ? 1 : 3);
            const completion = expected ? Math.min(100, Math.round((filled / expected) * 100)) : 0;

            return {
              periodId: p.id,
              periodLabel: p.label,
              average: avg,
              studentCount: studentIds.length,
              completion,
            };
          }),
        };
      })
      .filter(Boolean) as ClassSubjectGradeHistory[];
  });
}

/** Cartes "Mes classes" : une par affectation (classe, matière). */
export function getTeacherOverview(schoolId: string, teacherId: string, period: string): Promise<ContextOverview[]> {
  return respond(() => {
    const my = assignmentsOf(schoolId).filter((a) => a.teacherId === teacherId);
    const classes = classesOf(schoolId);
    const students = studentsOf(schoolId);
    return my
      .map((a) => {
        const cls = classes.find((c) => c.id === a.classId);
        const studentIds = students.filter((s) => s.classId === a.classId).map((s) => s.id);
        const gs = gradesOf(schoolId).filter((g) => g.classId === a.classId && g.subjectId === a.subjectId && g.period === period && studentIds.includes(g.studentId));
        const avgs = gs.map((g) => subjectAverage(g, cls?.cycle ?? "moyen")).filter((x): x is number => x !== null);
        return {
          classId: a.classId,
          subjectId: a.subjectId,
          className: cls?.name ?? "—",
          subjectName: subjectsOf(schoolId).find((s) => s.id === a.subjectId)?.name ?? "—",
          studentCount: studentIds.length,
          completion: gradeCompletion(gs, studentIds.length, cls?.cycle ?? "moyen"),
          average: avgs.length ? round2(avgs.reduce((x, y) => x + y, 0) / avgs.length) : null,
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className, "fr"));
  });
}