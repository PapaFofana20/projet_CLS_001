// Espace eleve : scolarite, notes et prochaines echeances.

import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { AsyncView } from "@/components/ui/AsyncView";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { LinkButton } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { SchoolMark } from "@/components/ui/Brand";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCurrentUser } from "@/context/AuthContext";
import { useSchool } from "@/context/SchoolContext";
import { getPeriods } from "@/data/school";
import { useAsync } from "@/hooks/useAsync";
import { getStudentDetail } from "@/services/studentService";
import { getStudentGradeHistory } from "@/services/gradeService";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";
import { averageTone } from "@/utils/grades";
import { PAY_STATUS_LABELS, remaining } from "@/utils/payments";
import { GradeEvolutionCharts } from "./charts";
import { GreetingSection } from "./GreetingSection";
import type { Payment } from "@/types";

/** Espace élève : école, notes et prochaines échéances. */
export function StudentHome() {
  const user = useCurrentUser();
  const school = useSchool();
  const settings = school.settings;
  const periodLabel = settings ? getPeriods(settings.periodType).find((p) => p.id === settings.currentPeriod)?.label : null;
  const state = useAsync(() => (user.studentId ? getStudentDetail(user, user.studentId) : Promise.resolve(null)), [user.studentId]);
  const history = useAsync(() => (user.studentId ? getStudentGradeHistory(user, user.studentId) : Promise.resolve([])), [user.studentId]);

  if (!user.studentId)
    return (
      <>
        <GreetingSection />
        <EmptyState icon="hourglass_top" title="Dossier en cours de validation" text="Votre école doit encore valider votre inscription. Vous recevrez un accès dès validation." />
      </>
    );

  return (
    <>
      <PageHeader
        title="Ma scolarité"
        subtitle={`${school.schoolName}${settings?.schoolYear ? ` · année scolaire ${settings.schoolYear}` : ""}`}
        actions={<LinkButton to="/app/bulletins" icon="description">Mon bulletin</LinkButton>}
      />
      <GreetingSection />
      <AsyncView state={state} skeleton={<Skeleton className="h-72 w-full" />}>
        {(d) =>
          !d ? null : (
            <div className="space-y-4">
              <Card dark>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <SchoolMark name={school.schoolName} matricule={school.school?.matricule} size={48} dark />
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-lime">{d.row.firstName} {d.row.lastName}</p>
                    <p className="text-sm text-white/70">
                      {d.row.matricule} · {d.classRoom.name}
                    </p>
                  </div>
                </div>
              </Card>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard dark icon="grade" label="Moyenne générale" value={d.report?.generalAverage == null ? "—" : `${formatNumber(d.report.generalAverage)} / 20`} note={periodLabel ?? undefined} />
                <StatCard icon="emoji_events" label="Rang" value={d.report?.rank ? `${d.report.rank}e / ${d.report.classSize}` : "—"} note={d.classRoom.name} />
                <StatCard icon="event_busy" label="Absences" value={d.report?.meta ? `${d.report.meta.absences} h` : "—"} note={d.report?.meta?.conduct ? `Conduite : ${d.report.meta.conduct}` : "Non renseigné"} />
                <StatCard icon="payments" label="Reste dû (échu)" value={formatCurrency(d.row.balance)} badge={d.row.balance > 0 ? { text: "À régler", tone: "down" } : { text: "À jour", tone: "up" }} />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader title="Mes notes" subtitle={`Moyenne par matière${periodLabel ? ` (${periodLabel})` : ""}`} action={<Link to="/app/notes" className="text-sm font-semibold text-forest hover:underline">Détails</Link>} />
                  <ul className="space-y-3">
                    {(d.report?.lines ?? []).slice(0, 8).map((l) => (
                      <li key={l.subjectId} className="flex items-center gap-3">
                        <span className="w-44 truncate text-sm font-medium">{l.subjectName}</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                          <div className="h-full rounded-full bg-leaf" style={{ width: `${((l.average ?? 0) / 20) * 100}%` }} />
                        </div>
                        <Badge tone={averageTone(l.average)} className="w-16 justify-center">
                          {l.average === null ? "—" : formatNumber(l.average)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card>
                  <CardHeader title="Prochaines échéances" action={<Link to="/app/paiements" className="text-sm font-semibold text-forest hover:underline">Tout voir</Link>} />
                  {d.payments.length === 0 ? (
                    <p className="text-sm text-neutral-500">Aucun échéancier : les paiements sont gérés dans l'espace parent.</p>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {d.payments
                        .filter((p) => remaining(p) > 0)
                        .slice(0, 4)
                        .map((p) => (
                          <PaymentLine key={p.id} payment={p} />
                        ))}
                    </ul>
                  )}
                  <p className="mt-4 flex items-start gap-2 rounded-2xl bg-lime-soft p-4 text-xs font-medium text-forest">
                    <Icon name="info" className="text-[18px]" />
                    Les paiements sont enregistrés par vos parents depuis leur espace. Ils apparaissent ici en temps réel.
                  </p>
                </Card>
              </div>
              {/* Évolution des notes */}
              <AsyncView state={history} skeleton={<Skeleton className="h-64 w-full" />}>
                {(h) => <GradeEvolutionCharts history={h ?? []} cycle={d.classRoom.cycle} />}
              </AsyncView>
            </div>
          )
        }
      </AsyncView>
    </>
  );
}

// Une ligne d'echeance a venir, avec le reste a payer.
function PaymentLine({ payment }: { payment: Payment }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span>
        <span className="block font-semibold">{payment.label}</span>
        <span className="text-xs text-neutral-500">Échéance {formatDate(payment.dueDate)} · {PAY_STATUS_LABELS[payment.status]}</span>
      </span>
      <span className="font-bold">{formatCurrency(remaining(payment))}</span>
    </li>
  );
}