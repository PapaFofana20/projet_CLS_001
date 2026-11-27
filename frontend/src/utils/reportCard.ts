// Assemble les données d'un bulletin à partir des notes, matières et affectations d'une classe.
import type {
  ClassRoom,
  ClassSubject,
  Grade,
  Period,
  ReportCardData,
  ReportLine,
  ReportMeta,
  Student,
  Subject,
  Teacher,
  TeachingAssignment,
} from "@/types";
import { appreciation, computeRanks, devoirsAverage, round2, subjectAverage, weightedAverage } from "./grades";

export interface ReportInput {
  classRoom: ClassRoom;
  students: Student[];
  grades: Grade[];
  classSubjects: ClassSubject[];
  subjects: Subject[];
  assignments: TeachingAssignment[];
  teachers: Teacher[];
  metas: ReportMeta[];
  period: Period;
}

// Construit les bulletins d'une classe : moyennes, rangs et appréciations de chaque élève.
export function buildClassReportCards(input: ReportInput): ReportCardData[] {
  const { classRoom, students, grades, classSubjects, subjects, assignments, teachers, metas, period } = input;
  const cs = classSubjects.filter((x) => x.classId === classRoom.id);
  // Indexation unique en amont : évite un find() linéaire par couple
  // élève × matière (O(n²) sur les bulletins des grandes classes).
  const gradeMap = new Map<string, Grade>();
  grades.forEach((g) => {
    if (g.classId === classRoom.id && g.period === period.id) {
      gradeMap.set(`${g.studentId}|${g.subjectId}`, g);
    }
  });
  const gradeOf = (studentId: string, subjectId: string) => gradeMap.get(`${studentId}|${subjectId}`);
  const subjectById = new Map(subjects.map((x) => [x.id, x]));
  const teacherById = new Map(teachers.map((x) => [x.id, x]));
  const assignmentBySubject = new Map<string, TeachingAssignment>();
  assignments.forEach((a) => {
    if (a.classId === classRoom.id && !assignmentBySubject.has(a.subjectId)) assignmentBySubject.set(a.subjectId, a);
  });
  const metaByStudent = new Map<string, ReportMeta>();
  metas.forEach((m) => {
    if (m.period === period.id && !metaByStudent.has(m.studentId)) metaByStudent.set(m.studentId, m);
  });

  const subjectRanks = new Map<string, Map<string, number>>();
  cs.forEach((c) => {
    subjectRanks.set(
      c.subjectId,
      computeRanks(students.map((s) => ({ id: s.id, value: subjectAverage(gradeOf(s.id, c.subjectId), classRoom.cycle) }))),
    );
  });

  const teacherName = (subjectId: string): string => {
    const a = assignmentBySubject.get(subjectId);
    const t = a ? teacherById.get(a.teacherId) : undefined;
    return t ? `${t.firstName} ${t.lastName}` : "—";
  };
  const head = classRoom.headTeacherId ? teacherById.get(classRoom.headTeacherId) : undefined;
  const headTeacherName = head ? `${head.firstName} ${head.lastName}` : "—";

  const partial = students.map((s) => {
    const lines: ReportLine[] = cs.map((c) => {
      const g = gradeOf(s.id, c.subjectId);
      const average = subjectAverage(g, classRoom.cycle);
      return {
        subjectId: c.subjectId,
        subjectName: subjectById.get(c.subjectId)?.name ?? c.subjectId,
        coefficient: c.coefficient,
        devoir1: g?.devoir1 ?? null,
        devoir2: g?.devoir2 ?? null,
        devoirsAvg: devoirsAverage(g),
        composition: g?.composition ?? null,
        average,
        rank: subjectRanks.get(c.subjectId)?.get(s.id) ?? null,
        teacherName: teacherName(c.subjectId),
        appreciation: appreciation(average),
      };
    });
    return { student: s, lines, generalAverage: weightedAverage(lines.map((l) => ({ average: l.average, coefficient: l.coefficient }))) };
  });

  const ranks = computeRanks(partial.map((p) => ({ id: p.student.id, value: p.generalAverage })));
  const avgs = partial.map((p) => p.generalAverage).filter((x): x is number => x !== null);
  const classAverage = avgs.length ? round2(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;

  return partial.map((p) => ({
    student: p.student,
    classRoom,
    period,
    lines: p.lines,
    generalAverage: p.generalAverage,
    rank: ranks.get(p.student.id) ?? null,
    classSize: students.length,
    classAverage,
    // Aucune valeur inventée : sans saisie réelle, la fiche affiche « Non renseigné ».
    meta: metaByStudent.get(p.student.id) ?? null,
    headTeacherName,
  }));
}
