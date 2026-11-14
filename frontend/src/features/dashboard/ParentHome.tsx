// Espace parent : suivi des eleves, notes et paiements.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "@/components/ui/Brand";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { AsyncView } from "@/components/ui/AsyncView";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { LinkButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCurrentUser } from "@/context/AuthContext";
import { useSchool } from "@/context/SchoolContext";
import { useChild } from "@/context/ChildContext";
import { useToast } from "@/context/ToastContext";
import { CYCLE_LABELS, getPeriods } from "@/data/school";
import { useAsync } from "@/hooks/useAsync";
import { linkChild } from "@/services/authService";
import { getStudentDetail } from "@/services/studentService";
import { getStudentGradeHistory } from "@/services/gradeService";
import { CHILD_CODE_LENGTH, formatMatriculeInput } from "@/utils/matricule";
import { formatCurrency, formatNumber } from "@/utils/format";
import { averageTone } from "@/utils/grades";
import { STUDENT_STATUS_LABELS } from "@/utils/payments";
import { GradeEvolutionCharts } from "./charts";
import { GreetingSection } from "./GreetingSection";
import type { Cycle } from "@/types";

// Bareme des notes : sur 10 a l'elementaire, sur 20 ensuite.
const getScale = (cycle?: Cycle | null) => (cycle === "elementaire" ? 10 : 20);

// Page d'accueil du parent : choix de l'enfant, puis son suivi.
export function ParentHome() {
  const user = useCurrentUser();
  const school = useSchool();
  const settings = school.settings;
  const periodLabel = settings ? getPeriods(settings.periodType).find((p) => p.id === settings.currentPeriod)?.label : null;
  const { children, activeChild, setActiveChildId, loading, error, reload } = useChild();
  const detail = useAsync(() => (activeChild ? getStudentDetail(user, activeChild.id) : Promise.resolve(null)), [activeChild?.id]);
  const history = useAsync(() => (activeChild ? getStudentGradeHistory(user, activeChild.id) : Promise.resolve([])), [activeChild?.id]);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [matricule, setMatricule] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && !error && children.length === 0)
    return (
      <>
        <GreetingSection />
        <EmptyState icon="child_care" title="Aucun élève rattaché à votre compte" text="Contactez l'école pour rattacher vos élèves à votre compte parent." action={<Button icon="add" onClick={() => setOpen(true)}>Ajouter un élève avec son matricule</Button>} />
      </>
    );

  const addChild = async () => {
    if (matricule.trim().length < 4) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      toast("Saisissez la date de naissance de l'élève (elle prouve son identité).", "error");
      return;
    }
    setBusy(true);
    try {
      const child = await linkChild(user, matricule, birthDate);
      toast(`${child.firstName} ${child.lastName} est rattaché à votre compte.`);
      setOpen(false);
      setMatricule("");
      setBirthDate("");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Rattachement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Suivi de mes élèves"
        subtitle={`${school.schoolName}${settings?.schoolYear ? ` · année scolaire ${settings.schoolYear}` : ""} · résultats et paiements de vos élèves.`}
        actions={<Button icon="add" onClick={() => setOpen(true)}>Ajouter un élève</Button>}
      />
      <GreetingSection />
      {error && (
        <button type="button" onClick={reload} className="mb-4 underline">
          Réessayer
        </button>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        {children.map((c) => {
          const active = c.id === activeChild?.id;
          return (
            <button key={c.id} type="button" onClick={() => setActiveChildId(c.id)} aria-pressed={active} className={`flex items-center gap-4 rounded-2xl p-5 text-left shadow-card transition-transform hover:-translate-y-1 ${active ? "bg-forest text-white" : "bg-white"}`}>
              <Avatar name={`${c.firstName} ${c.lastName}`} size={56} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-extrabold">
                  {c.firstName} {c.lastName}
                </p>
                <p className={`text-sm ${active ? "text-white/75" : "text-neutral-500"}`}>
                  {c.className} · {CYCLE_LABELS[c.cycle]}
                </p>
              </div>
              <Badge tone={c.payStatus === "a_jour" ? "success" : c.payStatus === "partiel" ? "warning" : "danger"}>{STUDENT_STATUS_LABELS[c.payStatus]}</Badge>
            </button>
          );
        })}
      </div>
      <AsyncView state={detail} skeleton={<Skeleton className="h-64 w-full" />}>
        {(d) =>
          d && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {(() => {
                  const scale = getScale(d.classRoom.cycle);
                  return (
                    <>
                      <StatCard dark icon="grade" label="Moyenne générale" value={d.report?.generalAverage == null ? "—" : `${formatNumber(d.report.generalAverage)} / ${scale}`} note={periodLabel ?? undefined} />
                      <StatCard icon="emoji_events" label="Rang" value={d.report?.rank ? `${d.report.rank}${d.report.rank === 1 ? "er" : "e"} / ${d.report.classSize}` : "—"} note={d.classRoom.name} />
                      <StatCard icon="event_busy" label="Absences" value={d.report?.meta ? `${d.report.meta.absences} h` : "—"} note={d.report?.meta?.conduct ? `Conduite : ${d.report.meta.conduct}` : "Non renseigné"} />
                      <StatCard icon="payments" label="Reste dû (échu)" value={formatCurrency(d.row.balance)} badge={d.row.balance > 0 ? { text: "À régler", tone: "down" } : { text: "À jour", tone: "up" }} />
                    </>
                  );
                })()}
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <CardHeader title={`Résultats de ${d.row.firstName}`} subtitle={`Moyenne par matière${periodLabel ? ` (${periodLabel})` : ""}`} action={<LinkButton to="/app/notes" variant="ghost" size="sm">Détails</LinkButton>} />
                  <ul className="space-y-3">
                    {(d.report?.lines ?? []).map((l) => {
                      const scale = getScale(d.classRoom.cycle);
                      return (
                        <li key={l.subjectId} className="flex items-center gap-3">
                          <span className="w-44 truncate text-sm font-medium">{l.subjectName}</span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                            <div className="h-full rounded-full bg-leaf" style={{ width: `${Math.min(100, ((l.average ?? 0) / scale) * 100)}%` }} />
                          </div>
                          <Badge tone={averageTone(l.average)} className="w-16 justify-center">
                            {l.average === null ? "—" : formatNumber(l.average)}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
                <Card>
                  <CardHeader title="Accès rapides" />
                  <div className="grid gap-2">
                    <Link to="/app/bulletins" className="flex min-h-12 items-center gap-3 rounded-xl bg-lime-soft px-4 text-sm font-semibold hover:bg-lime">Voir le bulletin</Link>
                    <Link to="/app/paiements" className="flex min-h-12 items-center gap-3 rounded-xl bg-lime-soft px-4 text-sm font-semibold hover:bg-lime">Payer une mensualité</Link>
                  </div>
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ajouter un élève"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="dark"
              loading={busy}
              disabled={matricule.trim().length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)}
              onClick={() => void addChild()}
            >
              Rattacher
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-2xl bg-lime-soft p-4 text-sm font-medium text-forest">
            <Icon name="confirmation_number" className="text-[20px]" />
            Saisissez le matricule de l'élève communiqué par {school.schoolName}. Il comporte {CHILD_CODE_LENGTH} caractères.
          </p>
          <Input
            label="Matricule de l'élève"
            required
            inputMode="text"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="EC260001"
            value={matricule}
            onChange={(e) => setMatricule(formatMatriculeInput(e.target.value, 20))}
            error={matricule && matricule.trim().length < 4 ? "Matricule invalide." : null}
          />
          <Input
            label="Date de naissance de l'élève"
            type="date"
            required
            max={new Date().toISOString().slice(0, 10)}
            hint="Second facteur d'identité : elle doit correspondre à la fiche de l'élève."
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}
