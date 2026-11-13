// Fiche détaillée d'un élève : aperçu, notes, paiements et famille.
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AsyncView } from "@/components/ui/AsyncView";
import { Avatar } from "@/components/ui/Brand";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, type Column } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { useCurrentUser } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { CYCLE_LABELS, todayIso } from "@/data/school";
import { useAsync } from "@/hooks/useAsync";
import { setPaymentManualStatus } from "@/services/paymentService";
import { getStudentDetail, type StudentDetail } from "@/services/studentService";
import type { ManualPaymentStatus, Payment, ReportLine } from "@/types";
import { ageFrom, formatCurrency, formatDate, formatNumber } from "@/utils/format";
import { averageTone } from "@/utils/grades";
import { MANUAL_PAYMENT_LABELS, manualChoiceOf, PAY_STATUS_LABELS, STUDENT_STATUS_LABELS } from "@/utils/payments";

const PAY_TONE = { paye: "success", partiel: "warning", en_retard: "danger", a_venir: "neutral" } as const;
const STATUS_TONE = { a_jour: "success", partiel: "warning", impaye: "danger" } as const;

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-mist p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function Detail({ d, onPaymentsChanged }: { d: StudentDetail; onPaymentsChanged: () => void }) {
  const user = useCurrentUser();
  const { toast } = useToast();
  const [tab, setTab] = useState("apercu");
  const [savingId, setSavingId] = useState<string | null>(null);
  const canEditPayments = user.role === "directeur" || user.role === "econome";

  const changePaymentStatus = async (p: Payment, next: ManualPaymentStatus) => {
    if (next === manualChoiceOf(p)) return;
    setSavingId(p.id);
    try {
      const updated = await setPaymentManualStatus(user, p.id, next);
      toast(`${p.label} : ${MANUAL_PAYMENT_LABELS[updated.manualStatus ?? next]}.`);
      onPaymentsChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Changement impossible.", "error");
    } finally {
      setSavingId(null);
    }
  };
  const tabs = [
    { id: "apercu", label: "Aperçu", icon: "badge" },
    ...(d.report ? [{ id: "notes", label: "Notes", icon: "edit_note" }] : []),
    ...(user.role !== "parent" || d.payments.length ? (d.payments.length ? [{ id: "paiements", label: "Paiements", icon: "payments" }] : []) : []),
    { id: "famille", label: "Famille", icon: "family_restroom" },
  ];
  const lineCols: Column<ReportLine>[] = [
    { key: "s", header: "Matière", render: (l) => <span className="font-semibold">{l.subjectName}</span> },
    ...(d.classRoom.cycle !== "elementaire"
      ? ([
          { key: "d1", header: "Devoir 1", align: "center", render: (l) => (l.devoir1 ?? "—") },
          { key: "d2", header: "Devoir 2", align: "center", render: (l) => (l.devoir2 ?? "—") },
        ] as Column<ReportLine>[])
      : []),
    { key: "c", header: "Composition", align: "center", render: (l) => (l.composition ?? "—") },
    { key: "m", header: "Moyenne", align: "center", render: (l) => <Badge tone={averageTone(l.average)}>{l.average === null ? "—" : formatNumber(l.average)}</Badge> },
  ];
  const payCols: Column<Payment>[] = [
    { key: "l", header: "Échéance", render: (p) => <span className="font-semibold">{p.label}</span> },
    { key: "d", header: "Date limite", render: (p) => formatDate(p.dueDate) },
    { key: "a", header: "Montant", align: "right", render: (p) => formatCurrency(p.amount) },
    { key: "p", header: "Payé", align: "right", render: (p) => formatCurrency(p.paidAmount) },
    {
      key: "s",
      header: "Statut",
      render: (p) => {
        if (!canEditPayments) {
          // Parents / élèves : lecture seule (en_retard affiché Impayé).
          const label = p.manualStatus === "impaye" || p.status === "en_retard" ? "Impayé" : PAY_STATUS_LABELS[p.status];
          const tone = p.manualStatus === "impaye" ? "danger" : PAY_TONE[p.status];
          return <Badge tone={tone}>{label}</Badge>;
        }
        const choice = manualChoiceOf(p);
        const options = Object.entries(MANUAL_PAYMENT_LABELS).map(([value, label]) => ({ value, label }));
        if (choice === "partiel") options.push({ value: "partiel", label: "Partiel" });
        return (
          <Select
            compact
            aria-label={`Statut de ${p.label}`}
            className="min-w-36"
            value={choice}
            disabled={savingId === p.id}
            options={options}
            onChange={(e) => void changePaymentStatus(p, e.target.value as ManualPaymentStatus)}
          />
        );
      },
    },
  ];
  const r = d.row;

  // Trie les paiements : d'abord les frais (non-mensualités), puis les mensualités par ordre chronologique (année/mois croissants)
  const sortedPayments = useMemo(() => {
    const frais = d.payments.filter((p) => p.kind !== "mensualite");
    const mensualites = d.payments.filter((p) => p.kind === "mensualite").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return [...frais, ...mensualites];
  }, [d.payments]);
  return (
    <div className="space-y-4">
      <Link to={user.role === "parent" ? "/app" : "/app/eleves"} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-forest hover:underline">
        <Icon name="arrow_back" className="text-[18px]" />
        {user.role === "parent" ? "Retour au suivi" : "Retour aux élèves"}
      </Link>
      <Card dark className="flex flex-wrap items-center gap-5">
        <Avatar name={`${r.firstName} ${r.lastName}`} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">
            {r.firstName} {r.lastName}
          </h1>
          <p className="text-sm text-white/75">
            {r.matricule} · {d.classRoom.name} · {CYCLE_LABELS[r.cycle]}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="lime">{d.classRoom.name}</Badge>
            {d.payments.length > 0 && <Badge tone={STATUS_TONE[r.payStatus]}>{STUDENT_STATUS_LABELS[r.payStatus]}</Badge>}
            {d.siblings.length > 0 && <Badge tone="info">Fratrie dans l'école</Badge>}
          </div>
        </div>
        {d.report && (
          <div className="rounded-2xl bg-white/10 px-6 py-3 text-center">
            <p className="text-3xl font-extrabold text-lime">{d.report.generalAverage === null ? "—" : formatNumber(d.report.generalAverage)}</p>
            <p className="text-xs text-white/70">Moyenne · rang {d.report.rank ?? "—"}/{d.report.classSize}</p>
          </div>
        )}
      </Card>
      <Tabs label="Sections de la fiche" items={tabs} value={tab} onChange={setTab} />
      {tab === "apercu" && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Date de naissance" value={`${formatDate(r.birthDate)} (${ageFrom(r.birthDate, todayIso())} ans)`} />
            <Info label="Genre" value={r.gender === "F" ? "Fille" : "Garçon"} />
            <Info label="Inscrit le" value={formatDate(r.enrolledAt)} />
            <Info label="Cantine" value={r.options.cantine ? "Oui" : "Non"} />
            <Info label="Transport" value={r.options.transport ? "Oui" : "Non"} />
            <Info label="Tenue scolaire" value={r.options.tenue ? "Oui" : "Non"} />
          </div>
        </Card>
      )}
      {tab === "notes" && d.report && (
        <Card padded={false} className="p-2">
          <Table caption="Notes du semestre" columns={lineCols} rows={d.report.lines} rowKey={(l) => l.subjectId} />
        </Card>
      )}
      {tab === "paiements" && (
        <>
          {canEditPayments && <p className="text-sm text-neutral-600">Pour chaque mois, choisissez le statut : <strong>À venir</strong> par défaut, <strong>Payé</strong> quand la famille a réglé, <strong>Impayé</strong> quand elle n'a pas encore payé.</p>}
          <Card padded={false} className="p-2">
            <Table caption="Échéancier de paiement" columns={payCols} rows={sortedPayments} rowKey={(p) => p.id} />
          </Card>
        </>
      )}
      {tab === "famille" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-4 text-lg font-bold">Parent / tuteur</h2>
            {d.parent ? (
              <>
                <p className="font-semibold">
                  {d.parent.firstName} {d.parent.lastName}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-neutral-600">
                  <li className="flex items-center gap-2">
                    <Icon name="call" className="text-[18px]" />
                    {d.parent.phone}
                  </li>
                  <li className="flex items-center gap-2">
                    <Icon name="mail" className="text-[18px]" />
                    {d.parent.email}
                  </li>
                  <li className="flex items-center gap-2">
                    <Icon name="home" className="text-[18px]" />
                    {d.parent.address || "—"}
                  </li>
                </ul>
              </>
            ) : (
              <p className="text-sm text-neutral-500">Aucun parent rattaché pour le moment.</p>
            )}
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-bold">Frères et sœurs</h2>
            {d.siblings.length === 0 ? (
              <p className="text-sm text-neutral-500">Aucun frère ou sœur dans l'école.</p>
            ) : (
              <ul className="space-y-2">
                {d.siblings.map((s) => (
                  <li key={s.id}>
                    <Link to={`/app/eleves/${s.id}`} className="flex min-h-12 items-center gap-3 rounded-xl bg-mist px-3 hover:bg-lime-soft">
                      <Avatar name={`${s.firstName} ${s.lastName}`} size={34} />
                      <span className="text-sm font-semibold">{s.firstName} {s.lastName}</span>
                      <Badge tone="lime" className="ml-auto">{s.className}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// Composant principal de la page.
export default function StudentDetailPage() {
  const { id = "" } = useParams();
  const user = useCurrentUser();
  // On récupère le détail complet de l'élève demandé.
  const state = useAsync(() => getStudentDetail(user, id), [id, user.id]);
  if (state.error && !state.loading)
    return (
      <EmptyState
        icon="person_off"
        title="Élève introuvable"
        text={state.error}
        action={<Link to="/app/eleves" className="font-semibold text-forest underline">Retour à la liste</Link>}
      />
    );
  return (
    <AsyncView state={state} skeleton={<Skeleton className="h-96 w-full" />}>
      {(d) => <Detail d={d} onPaymentsChanged={state.reload} />}
    </AsyncView>
  );
}
