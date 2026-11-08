// Tableau de bord du secretariat (vue administrative, sans finances).

import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { AsyncView } from "@/components/ui/AsyncView";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, type Column } from "@/components/ui/Table";
import { useCurrentUser } from "@/context/AuthContext";
import { useSchool } from "@/context/SchoolContext";
import { CYCLE_LABELS } from "@/data/school";
import { useAsync } from "@/hooks/useAsync";
import { listTeacherRows } from "@/services/teacherService";
import { listStudentRows, type StudentRow } from "@/services/studentService";
import { getSchoolOverview } from "@/services/schoolService";
import { GreetingSection } from "./GreetingSection";
import type { ClassRoom, Cycle } from "@/types";
import { formatDate, pluralize } from "@/utils/format";

interface ClassRow {
  id: string;
  name: string;
  cycle: Cycle;
  effectif: number;
  capacity: number;
}

/**
 * Tableau de bord du secrétariat : consultation administrative de l'école
 * (effectifs, classes, enseignants, dernières inscriptions). Aucune donnée
 * financière ni action de gestion : le secrétariat observe, la direction agit.
 */
export function SecretaireDashboard() {
  const user = useCurrentUser();
  const { schoolId, schoolName, settings } = useSchool();
  const state = useAsync(async () => {
    const [overview, students, teachers] = await Promise.all([
      getSchoolOverview(schoolId),
      listStudentRows(user),
      listTeacherRows(schoolId),
    ]);
    return { overview, students, teachers };
  }, [schoolId, user.id]);

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        subtitle={`${schoolName}${settings?.schoolYear ? ` · année scolaire ${settings.schoolYear}` : ""} · espace secrétariat.`}
      />
      <GreetingSection />
      <AsyncView state={state} skeleton={<Skeleton className="h-72 w-full" />}>
        {({ overview, students, teachers }) => (
          <Content students={students} classes={overview.classes} teacherCount={teachers.length} />
        )}
      </AsyncView>
    </>
  );
}

// Calcule les compteurs et les tableaux a partir des donnees chargees.
function Content({ students, classes, teacherCount }: { students: StudentRow[]; classes: ClassRoom[]; teacherCount: number }) {
  const now = new Date().toISOString().slice(0, 7);
  const newThisMonth = students.filter((s) => s.enrolledAt.startsWith(now)).length;
  const byCycle = (["elementaire", "moyen", "secondaire"] as Cycle[])
    .map((cycle) => ({ cycle, count: students.filter((s) => s.cycle === cycle).length }))
    .filter((c) => c.count > 0);

  const classRows: ClassRow[] = classes
    .map((c) => ({
      id: c.id,
      name: c.name,
      cycle: c.cycle,
      effectif: students.filter((s) => s.classId === c.id).length,
      capacity: c.capacity,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));

  const recent = [...students]
    .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt))
    .slice(0, 5);

  const recentCols: Column<StudentRow>[] = [
    { key: "name", header: "Élève", render: (s) => <span className="font-semibold">{s.firstName} {s.lastName}</span> },
    { key: "class", header: "Classe", render: (s) => <Badge tone="lime">{s.className}</Badge> },
    { key: "parent", header: "Parent", render: (s) => s.parentName || "—" },
    { key: "date", header: "Inscrit le", render: (s) => formatDate(s.enrolledAt) },
  ];

  const classCols: Column<ClassRow>[] = [
    { key: "name", header: "Classe", render: (c) => <span className="font-semibold">{c.name}</span> },
    { key: "cycle", header: "Cycle", render: (c) => CYCLE_LABELS[c.cycle] },
    { key: "effectif", header: "Effectif", align: "right", render: (c) => `${c.effectif} / ${c.capacity}` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard dark icon="groups" label="Élèves inscrits" value={String(students.length)} note="année scolaire en cours" />
        <StatCard icon="meeting_room" label="Classes" value={String(classes.length)} note={byCycle.map((c) => `${CYCLE_LABELS[c.cycle]} ${c.count}`).join(" · ") || "aucune classe"} />
        <StatCard icon="badge" label="Enseignants" value={String(teacherCount)} note="comptes enseignants enregistrés" />
        <StatCard icon="person_add" label="Nouvelles inscriptions" value={String(newThisMonth)} note="ce mois-ci" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Effectif par classe" subtitle={`${classes.length} ${pluralize(classes.length, "classe", "classes")}`} />
          {classRows.length ? (
            <Table caption="Effectif par classe" columns={classCols} rows={classRows} rowKey={(c) => c.id} />
          ) : (
            <EmptyState icon="meeting_room" title="Aucune classe" text="La direction n'a pas encore créé de classe." />
          )}
        </Card>

        <Card>
          <CardHeader title="Dernières inscriptions" subtitle="Les cinq élèves les plus récemment inscrits" />
          {recent.length ? (
            <Table caption="Dernières inscriptions" columns={recentCols} rows={recent} rowKey={(s) => s.id} />
          ) : (
            <EmptyState icon="groups" title="Aucun élève" text="Aucune inscription enregistrée pour le moment." />
          )}
        </Card>
      </div>
    </div>
  );
}
