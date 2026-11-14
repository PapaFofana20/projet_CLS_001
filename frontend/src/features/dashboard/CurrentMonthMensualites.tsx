// Mensualités du mois courant — saisie rapide pour l'économe / la direction.
// Affiche les élèves ayant une mensualité due ce mois-ci et permet de marquer
// le statut manuel : Payé / En retard / Non payé (impayé).
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Table, type Column } from "@/components/ui/Table";
import { useCurrentUser } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { listPaymentRows, setPaymentManualStatus, type PaymentRow } from "@/services/paymentService";
import { formatCurrency } from "@/utils/format";
import { todayIso } from "@/data/school";

const MANUAL_STATUS_LABELS: Record<"a_venir" | "paye" | "impaye" | "acompte", string> = {
  a_venir: "Non payé",
  paye: "Payé",
  impaye: "En retard",
  acompte: "Acompte",
};

const MANUAL_STATUS_TONES: Record<"a_venir" | "paye" | "impaye" | "acompte", "success" | "neutral" | "danger" | "warning"> = {
  a_venir: "neutral",
  paye: "success",
  impaye: "danger",
  acompte: "warning",
};

const MANUAL_STATUS_ICONS: Record<"a_venir" | "paye" | "impaye" | "acompte", string> = {
  a_venir: "radio_button_unchecked",
  paye: "check_circle",
  impaye: "schedule",
  acompte: "payments",
};

export function CurrentMonthMensualites() {
  const user = useCurrentUser();
  const { toast } = useToast();
  const canAct = user.role === "directeur" || user.role === "econome";

  const state = useAsync(() => listPaymentRows(user), [user.id]);

  // Filtre : mensualités du mois courant (dû ce mois)
  const currentMonth = todayIso().slice(0, 7); // "YYYY-MM"
  const rows = useMemo(() =>
    (state.data ?? []).filter(
      (p) => p.kind === "mensualite" && p.dueDate.startsWith(currentMonth)
    ),
    [state.data, currentMonth]
  );

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const toggleStatus = async (row: PaymentRow, next: "a_venir" | "paye" | "impaye") => {
    if (!canAct) return;
    setBusyIds((s) => new Set(s).add(row.id));
    try {
      await setPaymentManualStatus(user, row.id, next);
      toast(`${MANUAL_STATUS_LABELS[next]} pour ${row.studentName}.`);
      state.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Impossible de changer le statut.", "error");
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(row.id); return n; });
    }
  };

  const cols: Column<PaymentRow>[] = [
    { key: "s", header: "Élève", render: (r) => <span><strong>{r.studentName}</strong><span className="block text-xs text-neutral-500">{r.className}</span></span>, noTruncate: true },
    { key: "a", header: "Mensualité", align: "right", render: (r) => formatCurrency(r.amount), numeric: true },
    { key: "p", header: "Payé", align: "right", render: (r) => formatCurrency(r.paidAmount), numeric: true },
    {
      key: "st",
      header: "Statut",
      render: (r) => {
        const ms = r.manualStatus ?? "a_venir";
        return (
          <Badge tone={MANUAL_STATUS_TONES[ms]} className="flex items-center gap-1.5">
            <Icon name={MANUAL_STATUS_ICONS[ms]} className="text-[14px]" />
            {MANUAL_STATUS_LABELS[ms]}
          </Badge>
        );
      },
    },
    {
      key: "ac",
      header: canAct ? "Action" : "",
      align: "right",
      render: (r) => {
        if (!canAct) return null;
        const ms = r.manualStatus ?? "a_venir";
        const isBusy = busyIds.has(r.id);
        return (
          <div className="flex justify-end gap-1.5">
            {(["paye", "impaye", "a_venir"] as const).map((next) => (
              <Button
                key={next}
                size="sm"
                variant={ms === next ? "dark" : "outline"}
                disabled={isBusy || ms === next}
                onClick={() => void toggleStatus(r, next)}
                aria-pressed={ms === next}
                className="min-w-[80px]"
              >
                {MANUAL_STATUS_LABELS[next]}
              </Button>
            ))}
          </div>
        );
      },
      shrink: 0,
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Mensualités du mois"
        subtitle={`Mois de ${new Date().toLocaleString("fr-FR", { month: "long", year: "numeric" })} — cliquez pour marquer Payé / En retard / Non payé`}
        action={canAct ? (
          <span className="text-xs text-neutral-500">Seules les mensualités du mois sont listées</span>
        ) : null}
      />
      {state.error ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : state.loading ? (
        <SkeletonTable rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState icon="verified" title="Aucune mensualité ce mois" text="Toutes les mensualités de ce mois sont déjà réglées ou aucune n'est programmée." />
      ) : (
        <Table caption="Mensualités à encaisser ce mois" columns={cols} rows={rows} rowKey={(r) => r.id} stagger />
      )}
    </Card>
  );
}