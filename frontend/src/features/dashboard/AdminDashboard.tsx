// Tableau de bord de la direction (ou financier selon le mode).

import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { AsyncView } from "@/components/ui/AsyncView";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkButton } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
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
import { ClassBars, CycleDonut, CYCLE_COLORS, PaymentsChart } from "./charts";
import { GreetingSection } from "./GreetingSection";
import { LatestPayments } from "./LatestPayments";
import { useState } from "react";

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
            <LinkButton to="/app/paiements" icon="payments">
              Gérer les paiements
            </LinkButton>
          ) : (
            <LinkButton to="/app/inscription-eleve" icon="person_add">
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
      toast(checked ? "Bulletins masqués aux élèves et parents." : "Bulletins visibles aux élèves et parents.");
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
          {!finance && (
            <Card>
              <CardHeader title="Accès aux bulletins" subtitle="Contrôle l'affichage et le téléchargement des bulletins pour les élèves et parents." />
              <div className="px-6 pb-6">
                <Switch
                  checked={isBlocked}
                  disabled={busy}
                  onChange={(v) => void toggle(v)}
                  label="Bloquer les bulletins (élèves / parents)"
                  description="Quand activé, les bulletins sont masqués et le téléchargement/impression est désactivé."
                />
              </div>
            </Card>
          )}
        </>
      )}
      {/* Grilles pilotées par le conteneur (@container) : le nombre de colonnes ne change pas pendant la transition de la sidebar. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {finance ? (
              <>
                <StatCard dark icon="account_balance_wallet" label="Encaissé à ce jour" value={formatCurrency(s.collected)} badge={{ text: `${s.recoveryRate}%`, tone: "up" }} note="sur les échéances échues" />
                <StatCard icon="request_quote" label="Attendu à ce jour" value={formatCurrency(s.expected)} note="échéances au 15/12/2026" />
              </>
            ) : (
              <>
                <StatCard dark icon="groups" label="Effectif total" value={String(s.totalStudents)} badge={{ text: "2026-2027", tone: "neutral" }} note={s.byCycle.map((c) => `${CYCLE_LABELS[c.cycle]} ${c.count}`).join(" · ")} />
                <StatCard icon="savings" label="Taux de recouvrement" value={`${s.recoveryRate} %`} badge={{ text: s.recoveryRate >= 80 ? "Bon" : "À suivre", tone: s.recoveryRate >= 80 ? "up" : "down" }} note={`${formatCurrency(s.collected)} encaissés`} />
              </>
            )}
            <StatCard icon="warning" label="Impayés" value={formatCurrency(s.unpaidTotal)} badge={{ text: `${s.unpaidStudents} élèves`, tone: "down" }} note="échéances en retard" />
            {finance ? (
              <StatCard icon="percent" label="Taux de recouvrement" value={`${s.recoveryRate} %`} badge={{ text: s.recoveryRate >= 80 ? "Bon" : "À suivre", tone: s.recoveryRate >= 80 ? "up" : "down" }} />
            ) : (
              <StatCard icon="grade" label="Moyenne générale" value={s.generalAverage === null ? "—" : `${formatNumber(s.generalAverage)} / 20`} badge={{ text: "Semestre 1", tone: "neutral" }} note="toutes classes confondues" />
            )}
          </div>
          <Card>
            <CardHeader title="Paiements par mois" subtitle="Mensualités attendues et encaissées (octobre à juillet)" />
            <PaymentsChart data={s.paymentsByMonth} />
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Élèves par cycle" subtitle={`${s.totalStudents} élèves inscrits`} />
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
          </Card>
          <Card>
            <CardHeader title="Alertes" />
            <ul className="space-y-3">
              {s.alerts.map((a) => (
                <li key={a.id}>
                  <Link to={a.to} className="flex items-start gap-3 rounded-xl p-2 transition hover:bg-mist">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-full ${a.tone === "danger" ? "bg-red-100 text-danger" : a.tone === "warning" ? "bg-amber-100 text-amber-800" : "bg-lime-soft text-forest"}`}>
                      <Icon name={a.tone === "info" ? "info" : "warning"} fill className="text-[20px]" />
                    </span>
                    <span className="text-sm font-medium">{a.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {!finance && (
          <Card className="lg:col-span-2">
            <CardHeader title="Effectif par classe" subtitle="Élémentaire, moyen et secondaire" />
            <ClassBars data={s.studentsByClass} />
          </Card>
        )}
        <Card className={finance ? "lg:col-span-3" : ""}>
          <CardHeader title="Derniers paiements" action={<LinkButton to="/app/paiements" variant="ghost" size="sm">Tout voir</LinkButton>} />
          <LatestPayments rows={s.latestPayments} />
        </Card>
      </div>
    </div>
  );
}

