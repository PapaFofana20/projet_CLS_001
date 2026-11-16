// Synthese de classe et aide au conseil de classe, en lecture seule.

import { AsyncView } from "@/components/ui/AsyncView";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { useCurrentUser } from "@/context/AuthContext";
import { HeroBar, HeroCard, HeroLegend, KpiTile, PanelHeading } from "@/features/admin/adminUi";
import { useAsync } from "@/hooks/useAsync";
import { getClassReportCards } from "@/services/reportService";
import type { ReportCardData } from "@/types";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { averageTone, councilAppreciation } from "@/utils/grades";

interface Props {
  classId: string;
  period: string;
  title?: string;
}

/** Synthèse de classe en lecture seule + aide au conseil de classe. */
export function ClassSummary({ classId, period, title = "Synthèse de la classe" }: Props) {
  const user = useCurrentUser();
  const state = useAsync(() => getClassReportCards(user, classId, period), [classId, period, user.id]);
  if (state.loading && !state.error) return <SkeletonTable rows={8} />;
  return <AsyncView state={state}>{(cards) => <Summary cards={cards} title={title} />}</AsyncView>;
}

const GROUPS: { id: string; label: string; icon: string; tone: "success" | "info" | "warning" | "danger"; test: (a: number) => boolean }[] = [
  { id: "f", label: "Félicitations (≥ 16)", icon: "military_tech", tone: "success", test: (a) => a >= 16 },
  { id: "h", label: "Tableau d'honneur (14 à 16)", icon: "workspace_premium", tone: "success", test: (a) => a >= 14 && a < 16 },
  { id: "e", label: "Encouragements (12 à 14)", icon: "thumb_up", tone: "info", test: (a) => a >= 12 && a < 14 },
  { id: "d", label: "En difficulté (< 10)", icon: "support", tone: "danger", test: (a) => a < 10 },
];

// Trie les eleves par rang et regroupe les moyennes pour le conseil de classe.
function Summary({ cards, title }: { cards: ReportCardData[]; title: string }) {
  if (cards.length === 0) return null;
  const subjects = cards[0].lines;
  const avgs = cards.map((c) => c.generalAverage).filter((x): x is number => x !== null);
  const best = avgs.length ? Math.max(...avgs) : null;
  const worst = avgs.length ? Math.min(...avgs) : null;
  const cycle = cards[0].classRoom.cycle;
  const belowTen = avgs.filter((a) => a < 10).length;
  const passing = avgs.length - belowTen;
  return (
    <div className="space-y-4">
      <div role="note" className="flex items-start gap-3 rounded-2xl bg-lime-soft p-4 text-sm font-medium text-forest">
        <Icon name="visibility" className="text-[20px]" />
        Lecture seule : vous consultez toutes les matières de {cards[0].classRoom.name}, mais vous ne pouvez modifier que les notes de vos propres matières.
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <HeroCard
          eyebrow={`Synthèse · ${cards[0].classRoom.name}`}
          icon="analytics"
          value={cards[0].classAverage === null ? "—" : formatNumber(cards[0].classAverage)}
          label={`moyenne de classe${cycle !== "elementaire" ? " pondérée" : ""} · ${cards.length} élève${cards.length > 1 ? "s" : ""}`}
          footnote={`Meilleure moyenne ${best === null ? "—" : formatNumber(best)} · plus faible ${worst === null ? "—" : formatNumber(worst)}`}
        >
          <HeroBar
            segments={[
              { pct: avgs.length ? Math.round((passing / avgs.length) * 100) : 0, className: "bg-lime" },
              { pct: avgs.length ? Math.round((belowTen / avgs.length) * 100) : 0, className: "bg-red-400/80" },
            ]}
          />
          <HeroLegend
            items={[
              { dot: "bg-lime", label: `≥ 10 · ${passing}` },
              { dot: "bg-red-400", label: `< 10 · ${belowTen}` },
            ]}
            trailing={
              <>
                <Icon name="groups" className="text-[14px]" />
                {cards.length} élèves
              </>
            }
          />
        </HeroCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <KpiTile tone="lime" icon="analytics" label="Moyenne de classe" value={cards[0].classAverage === null ? "—" : formatNumber(cards[0].classAverage)} note="Toutes matières" />
          <KpiTile tone="sky" icon="military_tech" label="Meilleure moyenne" value={best === null ? "—" : formatNumber(best)} note="Major de classe" />
          <KpiTile tone={worst !== null && worst < 10 ? "red" : "neutral"} icon="support" label="Plus faible" value={worst === null ? "—" : formatNumber(worst)} note="Élève à accompagner" />
          <KpiTile tone={belowTen > 0 ? "amber" : "neutral"} icon="warning" label="Sous la moyenne" value={`${belowTen} / ${cards.length}`} note="Moyenne générale < 10" />
        </div>
      </div>

      <Card padded={false} className="overflow-hidden px-2 pb-2">
        <div className="px-3 pt-4 sm:px-4">
          <PanelHeading
            icon="table_chart"
            title={title}
            subtitle={`Moyennes par matière, moyenne générale${cycle !== "elementaire" ? " pondérée" : ""} et rang`}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[720px] text-sm">
            <caption className="sr-only">Synthèse des moyennes par matière</caption>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-neutral-500">
                <th scope="col" className="sticky left-0 bg-white px-4 py-3 text-left">Élève</th>
                {subjects.map((s) => (<th key={s.subjectId} scope="col" title={s.subjectName} className="px-2 py-3 text-center">{s.subjectName.split(/[\s-]/)[0].slice(0, 8)}{cycle !== "elementaire" ? ` (${s.coefficient})` : ""}</th>))}
                <th scope="col" className="px-2 py-3 text-center">Moy. gén.</th>
                <th scope="col" className="px-2 py-3 text-center">Rang</th>
              </tr>
            </thead>
            <tbody>
              {[...cards].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((c) => (
                <tr key={c.student.id} className="border-t border-neutral-100">
                  <th scope="row" className="sticky left-0 whitespace-nowrap bg-white px-4 py-2 text-left font-semibold">{c.student.firstName} {c.student.lastName}</th>
                  {c.lines.map((l) => (<td key={l.subjectId} className={cn("px-2 py-2 text-center font-medium", l.average !== null && l.average < 10 && "text-danger")}>{l.average === null ? "—" : formatNumber(l.average)}</td>))}
                  <td className="px-2 py-2 text-center"><Badge tone={averageTone(c.generalAverage)}>{c.generalAverage === null ? "—" : formatNumber(c.generalAverage)}</Badge></td>
                  <td className="px-2 py-2 text-center font-bold">{c.rank ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div>
        <PanelHeading icon="forum" title="Aide au conseil de classe" subtitle="Propositions automatiques à partir des moyennes générales" />
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {GROUPS.map((g) => {
            const list = cards.filter((c) => c.generalAverage !== null && g.test(c.generalAverage));
            return (
              <Card key={g.id}>
                <div className="mb-3 flex items-center gap-2"><Icon name={g.icon} fill className="text-forest" /><h3 className="text-sm font-bold">{g.label}</h3></div>
                {list.length === 0 ? <p className="text-sm text-neutral-400">Aucun élève</p> : (
                  <ul className="space-y-1.5 text-sm">
                    {list.map((c) => (<li key={c.student.id} className="flex items-center justify-between gap-2"><span>{c.student.firstName} {c.student.lastName}</span><Badge tone={g.tone}>{formatNumber(c.generalAverage ?? 0)}</Badge></li>))}
                  </ul>
                )}
                {list.length > 0 && <p className="mt-3 border-t border-neutral-100 pt-2 text-xs italic text-neutral-500">{councilAppreciation(list[0].generalAverage)}</p>}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
