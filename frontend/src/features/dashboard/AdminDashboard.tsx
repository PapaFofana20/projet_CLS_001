// Tableau de bord de la direction (ou financier selon le mode).
// Design aligné sur la console admin : bandeau forêt (HeroCard), tuiles KPI
// colorées (KpiTile), en-têtes de panneau (PanelHeading) et cartes à en-tête
// intégrée.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { AsyncView } from "@/components/ui/AsyncView";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { CYCLE_LABELS } from "@/data/school";
import { useAsync } from "@/hooks/useAsync";
import { periodInfo } from "@/services/reportService";
import { getAdminStats, type AdminStats } from "@/services/statsService";
import { updateSettings } from "@/services/schoolService";
import { useSchool } from "@/context/SchoolContext";
import { useCurrentUser } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { MatriculeCard } from "@/features/subscription/MatriculeCard";
import { OnboardingChecklist } from "@/features/subscription/OnboardingChecklist";
import { formatCurrency, formatNumber } from "@/utils/format";
import { cn } from "@/utils/cn";
import { ClassBars, CycleDonut, CYCLE_COLORS, PaymentsChart } from "./charts";
import { CurrentMonthMensualites } from "./CurrentMonthMensualites";
import { GreetingSection } from "./GreetingSection";
import { LatestPayments } from "./LatestPayments";
import {
  HeroBar,
  HeroCard,
  HeroLegend,
  KpiTile,
  PanelHeading,
} from "@/features/admin/adminUi";

// Bandeau de synthèse en haut du tableau de bord direction.
function SummaryBand({ s, finance }: { s: AdminStats; finance: boolean }) {
  if (finance) {
    return (
      <HeroCard
        eyebrow="Encaissements"
        icon="account_balance_wallet"
        value={formatCurrency(s.collected)}
        label="encaissé à ce jour sur les échéances échues"
        footnote={`Taux de recouvrement : ${s.recoveryRate} % · attendu ${formatCurrency(s.expected)}`}
      />
    );
  }
  return (
    <HeroCard
      eyebrow="Effectif"
      icon="groups"
      value={String(s.totalStudents)}
      label="élèves inscrits à l'établissement"
      footnote={`Récupération : ${s.recoveryRate} % · impayés ${formatCurrency(s.unpaidTotal)}`}
    >
      <HeroBar
        segments={s.byCycle.map((c) => ({
          pct: s.totalStudents > 0 ? Math.round((c.count / s.totalStudents) * 100) : 0,
          className: CYCLE_COLORS[c.cycle],
        }))}
      />
      <HeroLegend
        items={s.byCycle.map((c) => ({
          dot: CYCLE_COLORS[c.cycle],
          label: `${CYCLE_LABELS[c.cycle]} · ${c.count}`,
        }))}
      />
    </HeroCard>
  );
}

// Carte de contenu avec en-tête PanelHeading intégré (style console admin).
function ContentCard({
  children,
  heading,
  className,
}: {
  children: React.ReactNode;
  heading: React.ReactNode;
  className?: string;
}) {
  return (
    <Card padded={false} className={cn("overflow-hidden", className)}>
      <div className="px-4 pt-5 sm:px-6">{heading}</div>
      <div className="mt-4 px-4 pb-5 sm:px-5">{children}</div>
    </Card>
  );
}

// Charge les statistiques, puis delegue l'affichage au contenu ci-dessous.
export function AdminDashboard({ finance = false }: { finance?: boolean }) {
  const { schoolId, schoolName } = useSchool();
  const state = useAsync(() => getAdminStats(schoolId, periodInfo(schoolId).current), [schoolId]);
  return (
    <>
      <PageHeader
        title={finance ? "Tableau de bord financier" : "Tableau de bord"}
        subtitle={`${schoolName} · Année scolaire 2026-2027`}
        actions={
          finance ? (
            <LinkButton to="/app/paiements">
              Gérer les paiements
            </LinkButton>
          ) : (
            <LinkButton to="/app/inscription-eleve">
              Inscrire un élève
            </LinkButton>
          )
        }
      />
      <GreetingSection />
      <AsyncView state={state}>{(s) => <Content s={s} finance={finance} />}</AsyncView>
    </>
  );
}

// Assemble les cartes et graphiques a partir des statistiques chargees.
function Content({ s, finance }: { s: AdminStats; finance: boolean }) {
  const { school, schoolId, reload, settings } = useSchool();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const isBlocked = settings?.blockStudentBulletins ?? false;
  const currentUser = useCurrentUser();

  const toggle = async (checked: boolean) => {
    setBusy(true);
    try {
      await updateSettings(schoolId, { blockStudentBulletins: checked });
      reload();
      toast(
        checked ? "Bulletins masqués aux élèves et parents." : "Bulletins visibles aux élèves et parents.",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Impossible de mettre à jour.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!finance && (
        <>
          <OnboardingChecklist user={currentUser} />
          {school && <MatriculeCard school={school} canManage onChanged={() => window.location.reload()} />}
          <ContentCard
            heading={
              <PanelHeading
                icon="lock"
                title="Accès aux bulletins"
                subtitle="Contrôle l'affichage et le téléchargement des bulletins pour les élèves et parents."
              />
            }
          >
            <Switch
              checked={isBlocked}
              disabled={busy}
              onChange={(v) => void toggle(v)}
              label="Bloquer les bulletins (élèves / parents)"
              description="Quand activé, les bulletins sont masqués et le téléchargement/impression est désactivé."
            />
          </ContentCard>
        </>
      )}

      {/* Bandeau de synthèse (style console admin). */}
      <SummaryBand s={s} finance={finance} />

      {/* Tuiles KPI principales. */}
      <ContentCard
        heading={
          <PanelHeading
            icon="dashboard"
            title="Indicateurs clés"
            subtitle="Vue rapide de l'activité de l'établissement"
          />
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {finance ? (
            <>
              <KpiTile tone="sky" icon="request_quote" label="Attendu à ce jour" value={formatCurrency(s.expected)} note="échéances échues" />
              <KpiTile tone="red" icon="warning" label="Impayés" value={formatCurrency(s.unpaidTotal)} note="échéances en retard" />
              <KpiTile tone="violet" icon="percent" label="Taux de recouvrement" value={`${s.recoveryRate} %`} />
            </>
          ) : (
            <>
              <KpiTile tone="amber" icon="savings" label="Taux de recouvrement" value={`${s.recoveryRate} %`} note={`${formatCurrency(s.collected)} encaissés`} />
              <KpiTile tone="red" icon="warning" label="Impayés" value={formatCurrency(s.unpaidTotal)} note="échéances en retard" />
              <KpiTile tone="violet" icon="grade" label="Moyenne générale" value={s.generalAverage === null ? "—" : `${formatNumber(s.generalAverage)} / 20`} note="toutes classes confondues" />
            </>
          )}
        </div>
      </ContentCard>

      {/* Grilles pilotées par le conteneur (@container). */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ContentCard
            heading={
              <PanelHeading
                icon="payments"
                title="Paiements par mois"
                subtitle="Mensualités attendues et encaissées (octobre à juillet)"
              />
            }
          >
            <PaymentsChart data={s.paymentsByMonth} />
          </ContentCard>
        </div>
        <div className="space-y-4">
          <ContentCard
            heading={
              <PanelHeading
                icon="groups"
                title="Élèves par cycle"
                subtitle={`${s.totalStudents} élèves inscrits`}
              />
            }
          >
            <CycleDonut data={s.byCycle} />
            <ul className="mt-2 space-y-2">
              {s.byCycle.map((c) => (
                <li key={c.cycle} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="size-3 rounded-full" style={{ background: CYCLE_COLORS[c.cycle] }} />
                    {CYCLE_LABELS[c.cycle]}
                  </span>
                  <Badge tone="lime">{c.count} élèves</Badge>
                </li>
              ))}
            </ul>
          </ContentCard>
          <ContentCard
            heading={
              <PanelHeading icon="notifications_active" title="Alertes" subtitle="Points à surveiller" />
            }
          >
            <ul className="space-y-3">
              {s.alerts.map((a) => (
                <li key={a.id}>
                  <Link to={a.to} className="flex items-start gap-3 rounded-xl p-2">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full ${a.tone === "danger" ? "bg-red-100 text-danger" : a.tone === "warning" ? "bg-amber-100 text-amber-800" : "bg-lime-soft text-forest"}`}>
                      <Icon name={a.tone === "info" ? "info" : "warning"} fill className="text-[20px]" />
                    </span>
                    <span className="text-sm font-medium">{a.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </ContentCard>
        </div>
      </div>

      {/* Mensualités du mois courant — visible pour direction et économe */}
      <CurrentMonthMensualites />
      <div className="grid gap-4 lg:grid-cols-3">
        {!finance && (
          <ContentCard className="lg:col-span-2"
            heading={
              <PanelHeading
                icon="meeting_room"
                title="Effectif par classe"
                subtitle="Élémentaire, moyen et secondaire"
              />
            }
          >
            <ClassBars data={s.studentsByClass} />
          </ContentCard>
        )}
        <ContentCard className={finance ? "lg:col-span-3" : ""}
          heading={
            <PanelHeading
              icon="receipt_long"
              title="Derniers paiements"
              action={<LinkButton to="/app/paiements" variant="ghost" size="sm">Tout voir</LinkButton>}
            />
          }
        >
          <LatestPayments rows={s.latestPayments} />
        </ContentCard>
      </div>
    </div>
  );
}
