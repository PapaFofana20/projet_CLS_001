// Mensualités du mois courant — saisie rapide pour l'économe / la direction.
// Affiche les élèves ayant une mensualité due ce mois-ci et permet de marquer
// le statut manuel : Payé / En retard / Non payé (impayé).
// Deux filtres : une classe (menu déroulant) et une recherche par nom d'élève
// ou de parent, avec les coordonnées de la famille dans le tableau.
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Table, type Column } from "@/components/ui/Table";
import { useCurrentUser } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { PanelHeading } from "@/features/admin/adminUi";
import { useAsync } from "@/hooks/useAsync";
import { useDebounce } from "@/hooks/useDebounce";
import { listPaymentRows, setPaymentManualStatus, type PaymentRow } from "@/services/paymentService";
import { formatCurrency } from "@/utils/format";
import { toIntlPhone } from "@/utils/reminders";
import { levels, todayIso } from "@/data/school";

type ManualChoice = "a_venir" | "paye" | "impaye" | "acompte" | "partiel";

// Équivalent local de `manualChoiceOf` : le statut manuel prime, sinon on
// traduit le statut automatique (partiel conservé pour ne rien perdre).
function manualChoiceOfRow(p: PaymentRow): ManualChoice {
  if (p.manualStatus) return p.manualStatus;
  if (p.status === "paye") return "paye";
  if (p.status === "en_retard") return "impaye";
  if (p.status === "partiel") return "partiel";
  return "a_venir";
}

const MANUAL_STATUS_LABELS: Record<ManualChoice, string> = {
  a_venir: "Non payé",
  paye: "Payé",
  impaye: "En retard",
  acompte: "Acompte",
  partiel: "Partiel",
};

const MANUAL_STATUS_TONES: Record<ManualChoice, "success" | "neutral" | "danger" | "warning"> = {
  a_venir: "neutral",
  paye: "success",
  impaye: "danger",
  acompte: "warning",
  partiel: "warning",
};

const MANUAL_STATUS_ICONS: Record<ManualChoice, string> = {
  a_venir: "radio_button_unchecked",
  paye: "check_circle",
  impaye: "schedule",
  acompte: "payments",
  partiel: "payments",
};

// Recherche sans accents ni casse : « aissatou » retrouve « Aïssatou ».
const normalizeSearch = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Rang d'une classe dans l'ordre scolaire (CI → Terminale), 99 si inconnue.
function levelRank(className: string): number {
  const name = className.trim().toLowerCase();
  const level = levels.find((l) => name.startsWith(l.label.toLowerCase()) || name.startsWith(l.id));
  return level ? level.order : 99;
}

// Trie les classes dans l'ordre scolaire (CP, CE1… CM2, 6e… Terminale).
const compareClasses = (a: string, b: string) =>
  levelRank(a) - levelRank(b) || a.localeCompare(b, "fr", { numeric: true });

export function CurrentMonthMensualites() {
  const user = useCurrentUser();
  const { toast } = useToast();
  const canAct = user.role === "directeur" || user.role === "econome";

  const state = useAsync(() => listPaymentRows(user), [user.id]);

  // Filtres : recherche libre (élève, parent, téléphone) et classe choisie.
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 250);
  const [cls, setCls] = useState("");

  // Filtre : mensualités du mois courant (dû ce mois)
  const currentMonth = todayIso().slice(0, 7); // "YYYY-MM"
  const rows = useMemo(() =>
    (state.data ?? [])
      .filter((p) => p.kind === "mensualite" && p.dueDate.startsWith(currentMonth))
      .sort((a, b) => compareClasses(a.className, b.className) || a.studentName.localeCompare(b.studentName, "fr")),
    [state.data, currentMonth]
  );

  // Classes du mois, avec leur nombre de mensualités (affiché dans le menu).
  const classOptions = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => counts.set(r.className, (counts.get(r.className) ?? 0) + 1));
    return Array.from(counts, ([value, count]) => ({ value, label: count > 0 ? `${value} · ${count}` : value }))
      .sort((a, b) => compareClasses(a.value, b.value));
  }, [rows]);

  const filtered = useMemo(() => {
    const term = normalizeSearch(dq.trim());
    const digits = dq.replace(/\D/g, "");
    return rows.filter((r) => {
      if (cls && r.className !== cls) return false;
      if (!term) return true;
      if (normalizeSearch(`${r.studentName} ${r.parentName}`).includes(term)) return true;
      // Un numéro de téléphone se cherche aussi sans espaces ni indicatif.
      return digits.length >= 3 && r.parentPhone.replace(/\D/g, "").includes(digits);
    });
  }, [rows, dq, cls]);

  const hasFilters = Boolean(dq.trim() || cls);
  // Nombre de mensualités de la classe choisie (pour le compteur « x sur y »).
  const scopedCount = cls ? rows.filter((r) => r.className === cls).length : rows.length;
  const resetFilters = () => {
    setQ("");
    setCls("");
  };

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
    {
      key: "s",
      header: "Élève",
      noTruncate: true,
      render: (r) => (
        <span>
          <strong>{r.studentName}</strong>
          <span className="block text-xs text-neutral-500">{r.className}</span>
          {/* Coordonnées de la famille : affichées avec chaque élève pour la relance. */}
          <span className="mt-1 block text-xs text-neutral-500">
            {r.parentName}
            {r.parentPhone && (
              <>
                {" · "}
                <a href={`tel:+${toIntlPhone(r.parentPhone)}`} className="inline-flex items-center gap-0.5 font-medium text-forest hover:underline">
                  <Icon name="call" className="text-[13px]" />
                  {r.parentPhone}
                </a>
              </>
            )}
          </span>
        </span>
      ),
    },
    { key: "a", header: "Mensualité", align: "right", render: (r) => formatCurrency(r.amount), numeric: true },
    { key: "p", header: "Payé", align: "right", render: (r) => formatCurrency(r.paidAmount), numeric: true },
    {
      key: "st",
      header: "Statut",
      render: (r) => {
        const ms = manualChoiceOfRow(r);
        return (
          <Badge tone={MANUAL_STATUS_TONES[ms]} className="flex items-center gap-1.5">
            <Icon name={MANUAL_STATUS_ICONS[ms]} className="text-[14px]" />
            {MANUAL_STATUS_LABELS[ms]}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: canAct ? "Action" : "",
      align: "right",
      render: (r) => {
        if (!canAct) return null;
        const ms = manualChoiceOfRow(r);
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
      <PanelHeading
        icon="calendar_month"
        title="Mensualités du mois"
        subtitle={`Mois de ${new Date().toLocaleString("fr-FR", { month: "long", year: "numeric" })} — cliquez pour marquer Payé / En retard / Non payé`}
        action={canAct ? (
          <span className="text-xs text-neutral-500">Seules les mensualités du mois sont listées</span>
        ) : null}
      />

      {/* Filtres : une classe à la fois, ou recherche libre par nom / téléphone. */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          aria-label="Rechercher un élève"
          icon="search"
          placeholder="Rechercher un élève ou un parent…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          compact
          aria-label="Filtrer par classe"
          placeholder="Toutes les classes"
          value={cls}
          onChange={(e) => setCls(e.target.value)}
          options={classOptions}
          className="sm:max-w-[220px]"
        />
        {hasFilters && (
          <button type="button" onClick={resetFilters} className="flex min-h-11 items-center gap-1.5 self-start px-1 text-sm font-semibold text-neutral-600 hover:text-forest sm:self-auto">
            <Icon name="filter_alt_off" className="text-[18px]" />
            Réinitialiser
          </button>
        )}
        {rows.length > 0 && (
          <span aria-live="polite" className="text-xs text-neutral-500 sm:ml-auto">
            {filtered.length} élève{filtered.length > 1 ? "s" : ""}
            {hasFilters ? ` sur ${scopedCount}` : ""}
            {cls ? ` · ${cls}` : ""}
          </span>
        )}
      </div>

      {state.error ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : state.loading ? (
        <SkeletonTable rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState icon="verified" title="Aucune mensualité ce mois" text="Toutes les mensualités de ce mois sont déjà réglées ou aucune n'est programmée." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search_off"
          title="Aucun élève trouvé"
          text="Aucune mensualité du mois ne correspond à cette recherche ou à cette classe."
          action={<Button variant="outline" icon="filter_alt_off" onClick={resetFilters}>Réinitialiser les filtres</Button>}
        />
      ) : (
        <div className="mt-4">
          <Table caption="Mensualités à encaisser ce mois" columns={cols} rows={filtered} rowKey={(r) => r.id} stagger />
        </div>
      )}
    </Card>
  );
}
