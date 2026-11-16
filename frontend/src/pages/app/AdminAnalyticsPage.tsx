// Analyses de croissance et d'adoption de la plateforme.
import { PageHeader } from "@/components/ui/PageHeader";
import { AsyncView } from "@/components/ui/AsyncView";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useAsync } from "@/hooks/useAsync";
import { getAdminAnalytics } from "@/services/admin";
import type { AdminAnalyticsData } from "@/types";
import { CycleShareChart, GrowthChart } from "@/features/admin/charts";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";
import { planPriceLabel } from "@/utils/planPrice";
import { cn } from "@/utils/cn";
import {
  HeroBar,
  HeroCard,
  HeroLegend,
  KpiTile,
  MonoChip,
  Notice,
  PanelHeading,
  StatusDot,
} from "@/features/admin/adminUi";

const CYCLE_BAR_CLASSES = ["bg-lime", "bg-sky-300/90", "bg-amber-300/90"];

// Composant principal de la page.
export default function AdminAnalyticsPage() {
  const state = useAsync(() => getAdminAnalytics(), []);

  return (
    <>
      <PageHeader
        title="Analyses"
        subtitle="Croissance du réseau, adoption des formules et répartition des effectifs"
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton to="/admin/ecoles" variant="outline" icon="school">
              Établissements
            </LinkButton>
            <LinkButton to="/admin/finances" icon="insights">
              Finances
            </LinkButton>
          </div>
        }
      />
      <AsyncView state={state}>{(s) => <Content data={s} />}</AsyncView>
    </>
  );
}

function Content({ data }: { data: AdminAnalyticsData }) {
  const s = data.summary;
  const totalCitySchools = data.byCity.reduce((sum, c) => sum + c.schools, 0) || 1;
  const totalStudents = data.byCity.reduce((sum, c) => sum + c.students, 0) || 1;
  const payingShare = s.totalSchools > 0 ? Math.round((s.payingSchools / s.totalSchools) * 100) : 0;
  const totalCycleSchools = data.byCycle.reduce((sum, c) => sum + c.schools, 0) || 1;

  return (
    <div className="space-y-4">
      {s.totalSchools === 0 && (
        <Notice tone="info">
          <span className="font-bold">Aucun établissement enregistré pour le moment.</span> Les indicateurs de croissance, de conversion et de
          répartition se rempliront dès les premières inscriptions. Les formules et leurs tarifs sont déjà disponibles ci-dessous.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <HeroCard
          eyebrow="Croissance du réseau"
          icon="insights"
          value={formatNumber(s.totalSchools)}
          badge={
            <Badge tone={s.schoolsGrowthPct > 0 ? "success" : s.schoolsGrowthPct < 0 ? "danger" : "neutral"}>
              {s.schoolsGrowthPct === 0 ? "stable" : `${s.schoolsGrowthPct > 0 ? "+" : ""}${s.schoolsGrowthPct} %`}
            </Badge>
          }
          label={`${formatNumber(s.activeSchools)} établissement(s) actif(s) · ${formatNumber(s.newSchoolsThisMonth)} nouveau(x) ce mois`}
          footnote={`Données au ${formatDate(data.generatedAt)}`}
        >
          <HeroBar
            segments={data.byCycle.map((cycle, index) => ({
              pct: (cycle.schools / totalCycleSchools) * 100,
              className: CYCLE_BAR_CLASSES[index % CYCLE_BAR_CLASSES.length],
            }))}
          />
          <HeroLegend
            items={data.byCycle.map((cycle, index) => ({
              dot: CYCLE_BAR_CLASSES[index % CYCLE_BAR_CLASSES.length].replace(/\/\d+$/, ""),
              label: `${cycle.label} · ${cycle.schools}`,
            }))}
            trailing={
              <>
                <Icon name="trending_up" className="text-[14px]" />
                {formatNumber(s.averageStudentsPerSchool, 0)} élèves / école
              </>
            }
          />
        </HeroCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <KpiTile tone="sky" icon="groups" label="Élèves inscrits" value={formatNumber(s.totalStudents)} note="Toutes écoles confondues" />
          <KpiTile tone="lime" icon="workspace_premium" label="Taux de conversion" value={`${s.conversionRate} %`} note={`${s.payingSchools} école(s) sur ${s.totalSchools}`} />
          <KpiTile tone="amber" icon="payments" label="MRR" value={formatCurrency(s.mrr)} note="Abonnements valides aujourd'hui" valueClassName="text-lg" />
          <KpiTile tone="red" icon="person_remove" label="Taux d'attrition" value={`${s.churnRate} %`} note="Abonnements expirés sur le total" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <PanelHeading
            icon="insights"
            title="Croissance sur 12 mois"
            subtitle="Nouvelles écoles et nouveaux élèves par mois, parc cumulé en courbe."
            action={<Badge tone="lime">{s.newSchoolsLastMonth} → {s.newSchoolsThisMonth} écoles</Badge>}
          />
          <div className="mt-4">
            <GrowthChart data={data.growth} />
          </div>
        </Card>

        <Card>
          <PanelHeading icon="calendar_month" title="Ce mois-ci" subtitle="Comparaison avec le mois précédent." />
          <div className="mt-4 space-y-2">
            <MetricRow icon="add_business" label="Nouvelles écoles" value={String(s.newSchoolsThisMonth)} delta={s.newSchoolsThisMonth - s.newSchoolsLastMonth} />
            <MetricRow icon="person_add" label="Nouveaux élèves" value={formatNumber(s.studentsThisMonth)} delta={s.studentsThisMonth - s.studentsLastMonth} />
            <MetricRow icon="meeting_room" label="Classes" value={String(s.totalClasses)} />
            <MetricRow icon="badge" label="Enseignants" value={String(s.totalTeachers)} />
            <MetricRow icon="family_restroom" label="Parents" value={String(s.totalParents)} />
          </div>
          <div className="mt-4 rounded-2xl bg-mist p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Part d'écoles payantes</p>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-forest" style={{ width: `${payingShare}%` }} />
              </div>
              <span className="text-sm font-extrabold tabular-nums text-forest">{payingShare} %</span>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {s.payingSchools} école(s) avec abonnement valide sur {s.totalSchools}.
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" padded={false}>
          <div className="px-4 pt-5 sm:px-6">
            <PanelHeading icon="location_on" title="Répartition géographique" subtitle="Top 10 des villes par nombre d'établissements." />
          </div>
          <div className="px-4 py-4 sm:px-6">
            {data.byCity.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-500">Aucune ville renseignée.</p>
            ) : (
              <Table
                stagger
                caption="Répartition des établissements par ville"
                rows={data.byCity}
                rowKey={(c) => c.city}
                columns={[
                  {
                    key: "city",
                    header: "Ville",
                    render: (c) => (
                      <div className="flex items-center gap-2">
                        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-lime-soft text-forest">
                          <Icon name="location_on" fill className="text-[16px]" />
                        </span>
                        <span className="font-semibold text-ink">{c.city}</span>
                      </div>
                    ),
                  },
                  { key: "schools", header: "Écoles", align: "right", render: (c) => <span className="tabular-nums">{c.schools}</span> },
                  { key: "students", header: "Élèves", align: "right", className: "hidden sm:table-cell", render: (c) => <span className="tabular-nums">{formatNumber(c.students)}</span> },
                  {
                    key: "share",
                    header: "Poids",
                    align: "right",
                    render: (c) => (
                      <div className="flex min-w-28 items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-mist">
                          <div className="h-full rounded-full bg-leaf" style={{ width: `${(c.schools / totalCitySchools) * 100}%` }} />
                        </div>
                        <span className="w-10 text-right text-xs font-semibold text-neutral-600">
                          {Math.round((c.schools / totalCitySchools) * 100)} %
                        </span>
                      </div>
                    ),
                  },
                ]}
              />
            )}
            <p className="mt-3 text-xs text-neutral-500">{formatNumber(totalStudents)} élèves rattachés aux villes affichées.</p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <PanelHeading icon="school" title="Répartition par cycle" subtitle="Écoles proposant chaque niveau." />
          <div className="mt-4">
            <CycleShareChart data={data.byCycle} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {data.byCycle.map((c) => (
              <div key={c.cycle} className="rounded-xl bg-mist p-3 text-center">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{c.label}</p>
                <p className="text-lg font-extrabold text-ink">{c.schools}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeading icon="sell" title="Adoption des formules" subtitle="Écoles avec abonnement actif, par formule." />
          {data.byPlan.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">Aucune formule configurée.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {data.byPlan.map((plan) => (
                <div key={plan.planId}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-ink">{plan.name}</p>
                      <p className="text-xs text-neutral-500">{planPriceLabel(plan)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-extrabold tabular-nums text-forest">{plan.schools} école(s)</p>
                      <p className="text-xs text-neutral-500">{plan.share} % des payantes</p>
                    </div>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-mist">
                    <div className="h-full rounded-full bg-forest" style={{ width: `${Math.max(plan.share, plan.schools > 0 ? 2 : 0)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 rounded-2xl bg-lime-soft p-4 text-xs leading-relaxed text-forest">
            <strong>Levier de croissance :</strong> {s.totalSchools - s.payingSchools} établissement(s) n'ont pas encore de formule valide.
            L'onglet Abonnements permet d'activer ou relancer une école en quelques clics.
          </div>
        </Card>

        <Card padded={false}>
          <div className="px-4 pt-5 sm:px-6">
            <PanelHeading
              icon="emoji_events"
              title="Établissements les plus importants"
              subtitle="Classement par effectif d'élèves."
              action={<LinkButton to="/admin/ecoles" variant="ghost" size="sm" icon="arrow_forward">Tout voir</LinkButton>}
            />
          </div>
          <div className="px-4 py-4 sm:px-6">
            {data.topSchools.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-500">Aucun établissement enregistré.</p>
            ) : (
              <Table
                stagger
                caption="Principaux établissements par effectif"
                rows={data.topSchools}
                rowKey={(school) => school.schoolId}
                columns={[
                  {
                    key: "school",
                    header: "Établissement",
                    render: (school) => (
                      <div className="min-w-0">
                        <LinkButton to={`/admin/ecoles/${school.schoolId}`} variant="ghost" size="sm" icon="school" className="px-0">
                          {school.schoolName}
                        </LinkButton>
                        <div className="mt-0.5">
                          <MonoChip>{school.matricule || "Sans matricule"}</MonoChip>
                        </div>
                      </div>
                    ),
                  },
                  { key: "students", header: "Élèves", align: "right", render: (school) => <span className="tabular-nums">{formatNumber(school.students)}</span> },
                  { key: "classes", header: "Classes", align: "right", className: "hidden sm:table-cell", render: (school) => <span className="tabular-nums">{school.classes}</span> },
                  {
                    key: "status",
                    header: "Abonnement",
                    align: "center",
                    render: (school) => (
                      <Badge tone={school.subscriptionStatus === "ACTIF" ? "success" : "neutral"}>
                        <StatusDot tone={school.subscriptionStatus === "ACTIF" ? "success" : "neutral"} />
                        {school.subscriptionStatus === "ACTIF" ? "Actif" : "Inactif"}
                      </Badge>
                    ),
                  },
                ]}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetricRow({ icon, label, value, delta }: { icon: string; label: string; value: string; delta?: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-mist px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-forest">
        <Icon name={icon} className="text-[18px]" />
      </span>
      <span className="flex-1 text-sm font-medium text-neutral-700">{label}</span>
      {typeof delta === "number" && delta !== 0 && (
        <span className={cn("text-xs font-bold", delta > 0 ? "text-emerald-700" : "text-danger")}>
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      )}
      <span className="text-sm font-extrabold tabular-nums text-ink">{value}</span>
    </div>
  );
}
