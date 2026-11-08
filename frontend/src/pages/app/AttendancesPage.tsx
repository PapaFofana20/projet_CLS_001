// Présences : l'enseignant fait l'appel de sa classe (classe · matière · date),
// coche les absents / retards — l'enregistrement est automatique et visible
// aussitôt par la direction et le surveillant.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AsyncView } from "@/components/ui/AsyncView";
import { Avatar } from "@/components/ui/Brand";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { useCurrentUser } from "@/context/AuthContext";
import { useTeaching } from "@/context/TeachingContext";
import { useToast } from "@/context/ToastContext";
import { todayIso } from "@/data/school";
import { useAsync } from "@/hooks/useAsync";
import { listAbsences, type AbsenceRow } from "@/services/absenceService";
import { setAttendance, type AttendanceMark } from "@/services/attendanceService";
import { getSchoolOverview } from "@/services/schoolService";
import { listStudentRows, type StudentRow } from "@/services/studentService";
import { formatDate } from "@/utils/format";

const MARK_LABELS: Record<AttendanceMark, string> = {
  present: "Présent",
  absence: "Absent",
  retard: "Retard",
};
const MARK_TONE = { present: "success", absence: "danger", retard: "warning" } as const;

interface Loaded {
  students: StudentRow[];
  absences: AbsenceRow[];
  classSubjects: { classId: string; subjectId: string }[];
  subjects: { id: string; name: string }[];
}

export default function AttendancesPage() {
  const user = useCurrentUser();
  const state = useAsync(async (): Promise<Loaded> => {
    const [overview, students, absences] = await Promise.all([
      getSchoolOverview(user.schoolId),
      listStudentRows(user),
      listAbsences(user.schoolId),
    ]);
    return {
      students,
      absences,
      classSubjects: overview.classSubjects,
      subjects: overview.subjects.map((s) => ({ id: s.id, name: s.name })),
    };
  }, [user.id, user.schoolId]);

  return (
    <>
      <PageHeader
        title="Présences"
        subtitle="Faites l'appel de votre classe : cochez les absents et les retards — l'enregistrement est automatique."
      />
      <AsyncView state={state} skeleton={<Skeleton className="h-96 w-full" />}>
        {(d) => <Content d={d} onReload={state.reload} />}
      </AsyncView>
    </>
  );
}

function Content({ d, onReload }: { d: Loaded; onReload: () => void }) {
  const user = useCurrentUser();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const { contexts } = useTeaching();
  const [classId, setClassId] = useState(params.get("classId") ?? "");
  const [subjectId, setSubjectId] = useState(params.get("subjectId") ?? "");
  const [date, setDate] = useState(todayIso());
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const firstLoad = useRef(true);
  const marksRef = useRef(marks);
  marksRef.current = marks;

  const classIds = useMemo(() => Array.from(new Set(d.students.map((s) => s.classId))).sort(), [d.students]);
  const classNameOf = (id: string) => d.students.find((s) => s.classId === id)?.className ?? "";
  const activeClass = classId || classIds[0] || "";
  const classStudents = useMemo(
    () =>
      d.students
        .filter((s) => s.classId === activeClass)
        .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "fr")),
    [d.students, activeClass],
  );
  const teacherSubjects = contexts.filter((c) => c.classId === activeClass).map((c) => c.subjectId);
  const subjectOptions = useMemo(
    () =>
      (teacherSubjects.length
        ? d.subjects.filter((s) => teacherSubjects.includes(s.id))
        : d.subjects.filter((s) => d.classSubjects.some((cs) => cs.classId === activeClass && cs.subjectId === s.id))
      ).map((s) => ({ value: s.id, label: s.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.subjects, d.classSubjects, activeClass, contexts],
  );
  const activeSubject = subjectId || subjectOptions[0]?.value || "";
  const today = todayIso();
  const todayRows = d.absences.filter((a) => a.date === today);
  const counts = useMemo(() => {
    const c = { present: 0, absence: 0, retard: 0 };
    classStudents.forEach((s) => {
      c[marks[s.id] ?? "present"] += 1;
    });
    return c;
  }, [classStudents, marks]);
  const history = useMemo(
    () =>
      d.absences
        .filter((a) => classStudents.some((s) => s.id === a.studentId))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 20),
    [d.absences, classStudents],
  );

  // Charge l'appel déjà saisi pour la sélection courante.
  useEffect(() => {
    const next: Record<string, AttendanceMark> = {};
    classStudents.forEach((s) => {
      const row = d.absences.find(
        (a) => a.studentId === s.id && a.date === date && (a.subjectId ?? "") === activeSubject && a.type !== "discipline",
      );
      if (row) next[s.id] = row.type === "retard" ? "retard" : "absence";
    });
    setMarks(next);
    firstLoad.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClass, activeSubject, date]);

  const save = async (next: Record<string, AttendanceMark>) => {
    setSaving(true);
    try {
      const records = classStudents
        .filter((s) => (next[s.id] ?? "present") !== "present")
        .map((s) => ({ studentId: s.id, type: (next[s.id] === "retard" ? "retard" : "absence") as "absence" | "retard" }));
      await setAttendance(user, activeClass, activeSubject || null, date, records);
      setSavedAt(new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
      onReload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Enregistrement impossible.", "error");
      onReload();
    } finally {
      setSaving(false);
    }
  };

  // Enregistrement automatique (délai court après la dernière coche).
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(marksRef.current), 600);
    return () => window.clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks]);

  const setMark = (studentId: string, mark: AttendanceMark) => setMarks((m) => ({ ...m, [studentId]: mark }));
  const markAll = (mark: AttendanceMark) => {
    const next: Record<string, AttendanceMark> = {};
    classStudents.forEach((s) => {
      next[s.id] = mark;
    });
    setMarks(next);
  };
  const filteredStudents = classStudents.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q.trim().toLowerCase()));
  const rate = classStudents.length ? Math.round((counts.present / classStudents.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard dark icon="event_available" label="Présents" value={String(counts.present)} note={`${classNameOf(activeClass) || "—"} · ${formatDate(date)}`} />
        <StatCard icon="event_busy" label="Absents" value={String(counts.absence)} badge={counts.absence ? { text: "À suivre", tone: "down" } : { text: "Aucun", tone: "up" }} />
        <StatCard icon="schedule" label="Retards" value={String(counts.retard)} />
        <StatCard icon="percent" label="Taux de présence" value={`${rate} %`} note={`Aujourd'hui : ${todayRows.filter((a) => a.type === "absence").length} absent(s), ${todayRows.filter((a) => a.type === "retard").length} retard(s) (toutes classes)`} />
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <Select label="Classe" value={activeClass} onChange={(e) => { setClassId(e.target.value); setSubjectId(""); }} options={classIds.map((id) => ({ value: id, label: classNameOf(id) }))} />
          <Select label="Matière" value={activeSubject} onChange={(e) => setSubjectId(e.target.value)} options={subjectOptions} placeholder="Sans matière" />
          <Input label="Date de l'appel" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value || today)} />
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={() => markAll("present")}>Tous présents</Button>
            <Button variant="outline" onClick={() => markAll("absence")}>Tous absents</Button>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm text-neutral-600" aria-live="polite">
          {saving ? "Enregistrement en cours…" : savedAt ? `Enregistré automatiquement à ${savedAt} — visible par la direction et le surveillant.` : "Les coches sont enregistrées automatiquement, sans bouton à valider."}
        </p>
        <div className="mt-3">
          <Input aria-label="Rechercher un élève" icon="search" placeholder="Rechercher un élève…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>

      {classStudents.length === 0 ? (
        <EmptyState icon="groups" title="Aucun élève dans cette classe" text="Les élèves apparaîtront ici dès leur inscription dans la classe." />
      ) : (
        <Card padded={false} className="p-2">
          <ul className="divide-y divide-neutral-100">
            {filteredStudents.map((s) => {
              const mark = marks[s.id] ?? "present";
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <Avatar name={`${s.firstName} ${s.lastName}`} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.firstName} {s.lastName}</span>
                    <span className="block text-xs text-neutral-500">{s.matricule}</span>
                  </span>
                  <Badge tone={MARK_TONE[mark]}>{MARK_LABELS[mark]}</Badge>
                  <Select
                    compact
                    aria-label={`Présence de ${s.firstName} ${s.lastName}`}
                    className="w-36"
                    value={mark}
                    options={Object.entries(MARK_LABELS).map(([value, label]) => ({ value, label }))}
                    onChange={(e) => setMark(s.id, e.target.value as AttendanceMark)}
                  />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Derniers signalements" subtitle={`Classe ${classNameOf(activeClass) || "—"} · absences et retards récents`} />
        {history.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucun absent ni retard enregistré pour cette classe pour le moment.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {history.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="font-semibold">{a.studentName}</span>
                <Badge tone={a.type === "retard" ? "warning" : "danger"}>{a.type === "retard" ? "Retard" : "Absent"}</Badge>
                <span className="text-neutral-500">{formatDate(a.date)}{a.subjectName ? ` · ${a.subjectName}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
