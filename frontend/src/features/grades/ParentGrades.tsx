// Notes d'un eleve vues par son parent (ou par l'eleve lui-meme).

import { AsyncView } from "@/components/ui/AsyncView";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Table, type Column } from "@/components/ui/Table";
import { KpiTile, PanelCard } from "@/features/admin/adminUi";
import { useCurrentUser } from "@/context/AuthContext";
import { useChild } from "@/context/ChildContext";
import { useAsync } from "@/hooks/useAsync";
import { getClassReportCards } from "@/services/reportService";
import type { ReportLine } from "@/types";
import { formatNumber } from "@/utils/format";
import { averageTone } from "@/utils/grades";

/** Notes du compte : parent (élève sélectionné) ou élève (son propre relevé). */
export function ParentGrades({ period }: { period: string }) {
  const user = useCurrentUser();
  const { activeChild, loading, children } = useChild();
  const isStudent = user.role === "eleve";
  const studentId = isStudent ? user.studentId : activeChild?.id;

  const self = useAsync(async () => {
    if (!isStudent || !user.studentId) return null;
    const { getStudentDetail } = await import("@/services/studentService");
    const detail = await getStudentDetail(user, user.studentId);
    return detail.report;
  }, [isStudent, user.studentId]);

  const state = useAsync(async () => {
    if (!studentId) return null;
    if (isStudent) return self.data ?? null;
    const cards = await getClassReportCards(user, activeChild?.classId ?? "", period);
    return cards.find((c) => c.student.id === studentId) ?? null;
  }, [studentId, period, self.data]);

  if (!loading && !isStudent && children.length === 0) return <EmptyState icon="child_care" title="Aucun élève rattaché" />;
  if (state.loading && !state.error) return <SkeletonTable rows={7} />;

  return (
    <AsyncView state={state}>
      {(card) => {
        if (!card) return <EmptyState icon="grading" title="Pas encore de notes" text="Les notes apparaîtront ici dès leur saisie par les enseignants." />;
        const elem = card.classRoom.cycle === "elementaire";
        const title = isStudent ? `Mes notes · ${card.classRoom.name}` : `Notes de ${card.student.firstName} · ${card.classRoom.name}`;
        const cols: Column<ReportLine>[] = [
          { key: "s", header: "Matière", render: (l) => <span className="font-semibold">{l.subjectName}</span> },
          ...(elem
            ? []
            : ([
                { key: "coef", header: "Coef.", align: "center", render: (l) => l.coefficient },
                { key: "d1", header: "Devoir 1", align: "center", render: (l) => l.devoir1 ?? "—" },
                { key: "d2", header: "Devoir 2", align: "center", render: (l) => l.devoir2 ?? "—" },
              ] as Column<ReportLine>[])),
          { key: "c", header: "Composition", align: "center", render: (l) => l.composition ?? "—" },
          { key: "m", header: "Moyenne", align: "center", render: (l) => <Badge tone={averageTone(l.average)}>{l.average === null ? "—" : formatNumber(l.average)}</Badge> },
          ...(elem ? [] : ([{ key: "r", header: "Rang matière", align: "center", render: (l) => l.rank ?? "—" }] as Column<ReportLine>[])),
          { key: "a", header: "Appréciation", render: (l) => l.appreciation },
        ];
        return (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiTile
                icon="grade"
                label="Moyenne générale"
                value={card.generalAverage === null ? "—" : formatNumber(card.generalAverage)}
                note={`sur ${elem ? 10 : 20}`}
                tone="lime"
              />
              <KpiTile
                icon="emoji_events"
                label="Rang"
                value={card.rank ?? "—"}
                note={`sur ${card.classSize}`}
                tone="sky"
              />
              <KpiTile
                icon="trending_up"
                label="Moyenne de la classe"
                value={card.classAverage === null ? "—" : formatNumber(card.classAverage)}
                note={`sur ${elem ? 10 : 20}`}
                tone="neutral"
              />
            </div>
            <PanelCard
              icon="grade"
              title={title}
              subtitle={elem ? "Cycle élémentaire : notes de composition par matière." : "Moyenne de matière = (moyenne des devoirs + composition) / 2."}
            >
              <Table caption="Notes par matière" columns={cols} rows={card.lines} rowKey={(l) => l.subjectId} />
            </PanelCard>
          </div>
        );
      }}
    </AsyncView>
  );
}

