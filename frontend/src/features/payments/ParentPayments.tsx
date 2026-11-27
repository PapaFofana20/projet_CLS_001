// Echeancier et historique des paiements, cote parent ou eleve.

import { useMemo, useState } from "react";
import { AsyncView } from "@/components/ui/AsyncView";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Table, type Column } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { KpiTile } from "@/features/admin/adminUi";
import { useCurrentUser } from "@/context/AuthContext";
import { useChild } from "@/context/ChildContext";
import { useSchool } from "@/context/SchoolContext";
import { todayIso } from "@/data/school";
import { useAsync } from "@/hooks/useAsync";
import { listParentPayments } from "@/services/paymentService";
import type { PaymentRow } from "@/services/paymentRows";
import { formatCurrency, formatDate } from "@/utils/format";
import { PAY_METHOD_LABELS, PAY_STATUS_LABELS, remaining, sum } from "@/utils/payments";
import { Receipt } from "./Receipt";

export const PAY_TONE = { paye: "success", partiel: "warning", en_retard: "danger", a_venir: "neutral" } as const;

// Echeancier de l'enfant actif, sans les paiements des autres eleves.
export function ParentPayments({ schoolName, self = false }: { schoolName: string; self?: boolean }) {
  const user = useCurrentUser();
  const { activeChild, children, loading } = useChild();
  const { settings } = useSchool();
  const siblingDiscount = settings?.siblingDiscount ?? 0;
  const childId = self ? user.studentId : activeChild?.id;
  const state = useAsync(() => listParentPayments(user), [user.id]);
  const [tab, setTab] = useState("echeancier");
  const [receipt, setReceipt] = useState<PaymentRow | null>(null);

  const mine = useMemo(() => (state.data ?? []).filter((p) => p.studentId === childId).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [state.data, childId]);
  const overdue = mine.filter((p) => p.status === "en_retard" || (p.status === "partiel" && p.dueDate <= todayIso()));
  const unpaid = mine.filter((p) => remaining(p) > 0);
  const next = unpaid.find((p) => p.status === "a_venir");

  if (!loading && !self && children.length === 0) return <EmptyState icon="child_care" title="Aucun élève rattaché" />;

  const cols: Column<PaymentRow>[] = [
    { key: "l", header: "Échéance", render: (p) => <span className="font-semibold">{p.label}</span> },
    { key: "d", header: "Date limite", render: (p) => formatDate(p.dueDate) },
    { key: "a", header: "Montant", align: "right", render: (p) => formatCurrency(p.amount) },
    { key: "r", header: "Reste", align: "right", render: (p) => (remaining(p) > 0 ? <strong>{formatCurrency(remaining(p))}</strong> : "—") },
    { key: "s", header: "Statut", render: (p) => <Badge tone={PAY_TONE[p.status]}>{PAY_STATUS_LABELS[p.status]}</Badge> },
  ];
  const historyCols: Column<PaymentRow>[] = [
    { key: "d", header: "Date", render: (p) => formatDate(p.paidAt) },
    { key: "l", header: "Échéance", render: (p) => <span className="font-semibold">{p.label}</span> },
    { key: "m", header: "Moyen", render: (p) => (p.method ? <Badge tone="info">{PAY_METHOD_LABELS[p.method]}</Badge> : "—") },
    { key: "a", header: "Montant payé", align: "right", render: (p) => formatCurrency(p.paidAmount) },
    { key: "r", header: "Reçu", align: "right", render: (p) => <Button size="sm" variant="outline" icon="receipt_long" onClick={() => setReceipt(p)}>Reçu</Button> },
  ];

  return (
    <AsyncView state={state} skeleton={<SkeletonTable />}>
      {() => (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiTile
              icon="warning"
              label="Reste à payer (échu)"
              value={formatCurrency(sum(overdue.map(remaining)))}
              note={`${overdue.length} échéance${overdue.length > 1 ? "s" : ""} en retard`}
              tone="red"
            />
            <KpiTile
              icon="task_alt"
              label="Déjà payé"
              value={formatCurrency(sum(mine.map((p) => p.paidAmount)))}
              tone="lime"
            />
            <KpiTile
              icon="event"
              label="Prochaine échéance"
              value={next ? formatDate(next.dueDate) : "—"}
              note={next ? `${next.label} · ${formatCurrency(next.amount)}` : "Tout est à jour"}
              tone="neutral"
            />
          </div>
          {children.length > 1 && !self && siblingDiscount > 0 && (
            <p className="flex items-center gap-2 rounded-2xl bg-lime-soft p-4 text-sm font-medium text-forest">
              <Icon name="family_restroom" className="text-[20px]" />
              Réduction fratrie de {siblingDiscount} % appliquée sur la mensualité à partir du 2e élève inscrit dans l'école.
            </p>
          )}
          <Tabs label="Paiements" value={tab} onChange={setTab} items={[{ id: "echeancier", label: "Échéancier", icon: "calendar_month" }, { id: "historique", label: "Historique et reçus", icon: "receipt_long" }]} />
          {tab === "echeancier" ? (
            <>
              {overdue.length > 0 && <p className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-sm font-medium text-danger"><Icon name="priority_high" className="text-[20px]" />{overdue.length} échéance{overdue.length > 1 ? "s" : ""} en retard : réglez auprès de l'économe de l'école.</p>}
              <Card padded={false} className="p-2"><Table caption="Échéancier" columns={cols} rows={mine} rowKey={(p) => p.id} /></Card>
            </>
          ) : mine.some((p) => p.paidAmount > 0) ? (
            <Card padded={false} className="p-2"><Table caption="Historique des paiements" columns={historyCols} rows={mine.filter((p) => p.paidAmount > 0).sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))} rowKey={(p) => p.id} /></Card>
          ) : (
            <EmptyState icon="receipt_long" title="Aucun paiement enregistré" />
          )}
          <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Reçu de paiement" footer={<><Button variant="outline" icon="print" onClick={() => window.print()}>Imprimer</Button><Button variant="dark" onClick={() => setReceipt(null)}>Fermer</Button></>}>
            {receipt && <Receipt payments={[receipt]} schoolName={schoolName} />}
          </Modal>
        </div>
      )}
    </AsyncView>
  );
}
