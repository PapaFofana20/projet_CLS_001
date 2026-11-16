// Demandes d'inscription a valider, en lot ou une par une.

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Table, type Column } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/context/ToastContext";
import { HeroBar, HeroCard, HeroLegend, KpiTile, PanelHeading } from "@/features/admin/adminUi";
import { formatDateTime } from "@/utils/format";
import type { RegistrationRequestRow } from "@/services/registrationService";
import { cn } from "@/utils/cn";

interface Props {
  pending: RegistrationRequestRow[];
  history: RegistrationRequestRow[];
  onApprove: (ids: string[]) => Promise<void>;
  onReject: (ids: string[]) => Promise<void>;
  busy: boolean;
  /** Limite d'élèves atteinte : les approbations d'élèves sont bloquées. */
  limitReached?: boolean;
}

const STATUS_TONE = { EN_ATTENTE: "warning", APPROUVEE: "success", REFUSEE: "danger" } as const;
const STATUS_LABEL = { EN_ATTENTE: "En attente", APPROUVEE: "Approuvée", REFUSEE: "Refusée" } as const;

/** Liste des demandes d'inscription (validation en lot). */
export function PendingList({ pending, history, onApprove, onReject, busy, limitReached = false }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState("pending");
  const [picked, setPicked] = useState<string[]>([]);

  const rows = tab === "pending" ? pending : history;
  const allPicked = pending.length > 0 && picked.length === pending.length;

  const run = async (kind: "approve" | "reject") => {
    const ids = picked.length ? picked : pending.map((r) => r.id);
    if (ids.length === 0) {
      toast("Sélectionnez au moins une demande.", "error");
      return;
    }
    try {
      if (kind === "approve") await onApprove(ids);
      else await onReject(ids);
      setPicked([]);
    } catch {
      /* le message d'erreur est affiché par la page */
    }
  };

  const columns: Column<RegistrationRequestRow>[] = [
    {
      key: "sel",
      header: <span className="sr-only">Sélection</span>,
      render: (r) =>
        r.status === "EN_ATTENTE" ? (
          <label className="grid size-11 cursor-pointer place-items-center rounded-full">
            <input
              type="checkbox"
              className="size-5 accent-forest"
              aria-label={`SǸlectionner ${r.firstName} ${r.lastName}`}
              checked={picked.includes(r.id)}
              onChange={() => setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))}
            />
          </label>
        ) : (
          <Icon name="check_circle" className="text-leaf" />
        ),
    },
    {
      key: "who",
      header: "Demandeur",
      render: (r) => (
        <div>
          <p className="font-semibold">
            {r.firstName} {r.lastName}
          </p>
          <p className="text-xs text-neutral-500">{r.email}</p>
        </div>
      ),
    },
    { key: "role", header: "Type", render: (r) => <Badge tone={r.role === "eleve" ? "info" : "neutral"}>{r.role === "eleve" ? "Élève" : "Parent"}</Badge> },
    { key: "class", header: "Classe", render: (r) => r.className },
    ...(tab === "pending"
      ? ([{ key: "phone", header: "Téléphone", render: (r) => r.phone }] as Column<RegistrationRequestRow>[])
      : ([{ key: "status", header: "Statut", render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> }, { key: "when", header: "Reçue le", render: (r) => formatDateTime(r.createdAt) }] as Column<RegistrationRequestRow>[])),
    ...(tab === "pending"
      ? ([
          {
            key: "actions",
            align: "right",
            header: <span className="sr-only">Actions</span>,
            render: (r) => (
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="dark" onClick={() => void onApprove([r.id])} disabled={busy || (r.role === "eleve" && limitReached)}>
                  Approuver
                </Button>
                <Button size="sm" variant="outline" onClick={() => void onReject([r.id])} disabled={busy}>
                  Refuser
                </Button>
              </div>
            ),
          },
        ] as Column<RegistrationRequestRow>[])
      : []),
  ];

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <Tabs label="Demandes" value={tab} onChange={setTab} items={[{ id: "pending", label: "En attente", icon: "pending_actions", badge: pending.length }, { id: "history", label: "Historique", icon: "history", badge: history.length }]} />
        <EmptyState icon="how_to_reg" title={tab === "pending" ? "Aucune demande en attente" : "Aucun historique"} text={tab === "pending" ? "Les nouvelles inscriptions apparaîtront ici." : undefined} />
      </div>
    );
  }

  const approved = history.filter((r) => r.status === "APPROUVEE").length;
  const rejected = history.filter((r) => r.status === "REFUSEE").length;
  const students = pending.filter((r) => r.role === "eleve").length;
  const parents = pending.length - students;
  const total = pending.length + history.length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <HeroCard
          eyebrow="Demandes d'inscription"
          icon="how_to_reg"
          value={pending.length}
          label={`demande${pending.length > 1 ? "s" : ""} en attente · ${total} au total`}
          footnote={`${students} élève(s) · ${parents} parent(s) · ${approved} approuvée(s), ${rejected} refusée(s)`}
        >
          <HeroBar
            segments={[
              { pct: total > 0 ? Math.round((pending.length / total) * 100) : 0, className: "bg-amber-300/90" },
              { pct: total > 0 ? Math.round((approved / total) * 100) : 0, className: "bg-lime" },
              { pct: total > 0 ? Math.round((rejected / total) * 100) : 0, className: "bg-red-400/80" },
            ]}
          />
          <HeroLegend
            items={[
              { dot: "bg-amber-300", label: `En attente · ${pending.length}` },
              { dot: "bg-lime", label: `Approuvées · ${approved}` },
              { dot: "bg-red-400", label: `Refusées · ${rejected}` },
            ]}
            trailing={
              <>
                <Icon name="pending_actions" className="text-[14px]" />
                {picked.length} sélectionnée(s)
              </>
            }
          />
        </HeroCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <KpiTile tone={pending.length > 0 ? "amber" : "neutral"} icon="pending_actions" label="En attente" value={pending.length} note="À traiter" />
          <KpiTile tone="sky" icon="groups" label="Élèves" value={students} note="Demandes d'élèves" />
          <KpiTile tone="lime" icon="task_alt" label="Approuvées" value={approved} note="Historique" />
          <KpiTile tone={rejected > 0 ? "red" : "neutral"} icon="close" label="Refusées" value={rejected} note="Historique" />
        </div>
      </div>

      <Tabs label="Demandes" value={tab} onChange={setTab} items={[{ id: "pending", label: "En attente", icon: "pending_actions", badge: pending.length }, { id: "history", label: "Historique", icon: "history", badge: history.length }]} />
      {limitReached && (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-900">
          <Icon name="warning" fill className="text-[20px]" />
          La limite d'élèves de votre formule est atteinte : changez de formule pour approuver de nouvelles inscriptions d'élèves.
        </p>
      )}
      {tab === "pending" && pending.length > 0 && (
        <Card>
          <PanelHeading
            icon="task_alt"
            title="Validation en lot"
            subtitle="Sélectionnez les demandes puis approuvez ou refusez d'un coup."
            action={picked.length > 0 ? <Badge tone="lime">{picked.length} sélectionnée(s)</Badge> : undefined}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setPicked(allPicked ? [] : pending.map((r) => r.id))}>
              {allPicked ? "Tout désélectionner" : "Tout sélectionner"}
            </Button>
            <Button variant="dark" icon="task_alt" loading={busy} onClick={() => void run("approve")} disabled={limitReached}>
              Approuver la sélection ({picked.length || pending.length})
            </Button>
            <Button variant="ghost" icon="close" disabled={busy} onClick={() => void run("reject")}>
              Refuser la sélection
            </Button>
          </div>
        </Card>
      )}
      <Card padded={false} className={cn("overflow-hidden px-2 pb-2")}>
        <div className="px-3 pt-4 sm:px-4">
          <PanelHeading
            icon={tab === "pending" ? "pending_actions" : "history"}
            title={tab === "pending" ? "Demandes en attente" : "Historique des demandes"}
            subtitle={`${rows.length} ${tab === "pending" ? "demande(s) à traiter" : "demande(s) traitée(s)"}`}
          />
        </div>
        <div className="mt-3">
          <Table caption="Demandes d'inscription" columns={columns} rows={rows} rowKey={(r) => r.id} />
        </div>
      </Card>
    </div>
  );
}