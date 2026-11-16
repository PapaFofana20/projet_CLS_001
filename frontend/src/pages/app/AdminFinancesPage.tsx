// Finances de la plateforme : encaissements, transactions et reçus.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { AsyncView } from "@/components/ui/AsyncView";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAsync } from "@/hooks/useAsync";
import { usePlatformStatus } from "@/context/PlatformContext";
import { getAdminFinances } from "@/services/admin";
import type { AdminFinanceEvent, AdminFinancesData } from "@/types";
import { eventLabel, methodLabel } from "@/features/admin/labels";
import { RevenueChart } from "@/features/admin/charts";
import { formatCurrency, formatDate, formatDateTime } from "@/utils/format";
import { planPriceLabel } from "@/utils/planPrice";
import { cn } from "@/utils/cn";
import {
  HeroCard,
  KpiTile,
  Notice,
  PanelHeading,
  StatusDot,
} from "@/features/admin/adminUi";

type TabID = "vue" | "transactions" | "factures";

const EVENT_TONES: Record<string, BadgeTone> = {
  purchase: "success",
  renewal: "info",
  plan_change: "warning",
  expiration_warning: "danger",
};

const PAGE_SIZE = 12;

function tabFromPath(pathname: string): TabID {
  if (pathname.endsWith("/transactions")) return "transactions";
  if (pathname.endsWith("/factures")) return "factures";
  return "vue";
}

function receiptNumber(event: AdminFinanceEvent): string {
  return event.paymentRef || `REC-${event.id.slice(0, 8).toUpperCase()}`;
}

// Composant principal de la page.
export default function AdminFinancesPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { status } = usePlatformStatus();
  const [tab, setTab] = useState<TabID>(tabFromPath(pathname));
  const [detail, setDetail] = useState<AdminFinanceEvent | null>(null);
  // On récupère l'ensemble des données financières en une fois.
  const state = useAsync(() => getAdminFinances(), []);

  useEffect(() => {
    setTab(tabFromPath(pathname));
  }, [pathname]);

  const changeTab = (id: string) => {
    setTab(id as TabID);
    const target = id === "transactions" ? "/admin/finances/transactions" : id === "factures" ? "/admin/finances/factures" : "/admin/finances";
    if (pathname !== target) navigate(target);
  };

  return (
    <>
      <PageHeader
        title="Finances et revenus"
        subtitle="Encaissements réels des abonnements, moyens de paiement et pièces justificatives"
        actions={<LinkButton to="/admin/abonnements" icon="workspace_premium">Gérer les abonnements</LinkButton>}
      />

      <AsyncView state={state}>
        {(s) => {
          const monthDelta =
            s.summary.revenueLastMonth > 0
              ? Math.round(((s.summary.revenueThisMonth - s.summary.revenueLastMonth) / s.summary.revenueLastMonth) * 1000) / 10
              : null;
          // Compatibilité avec une API plus ancienne (avant l'ajout de `events`).
          const allEvents = s.events ?? s.recentEvents ?? [];
          const invoices = allEvents.filter((e) => e.amountPaid > 0);
          const maxMonthly = Math.max(...s.monthly.map((m) => m.revenue), 1);

          return (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <HeroCard
                  eyebrow="Encaissements"
                  icon="payments"
                  value={formatCurrency(s.summary.revenueThisMonth)}
                  valueClassName="text-3xl sm:text-4xl"
                  badge={
                    <Badge tone={monthDelta === null ? "neutral" : monthDelta >= 0 ? "success" : "danger"}>
                      {monthDelta === null ? "1er mois" : `${monthDelta > 0 ? "+" : ""}${monthDelta} %`}
                    </Badge>
                  }
                  label={`encaissés ce mois · mois précédent : ${formatCurrency(s.summary.revenueLastMonth)}`}
                  footnote={`Données au ${formatDate(s.generatedAt)}`}
                >
                  <div className="flex h-16 items-end gap-1.5" aria-hidden="true">
                    {s.monthly.map((month, index) => (
                      <span
                        key={month.key}
                        title={`${month.label} · ${formatCurrency(month.revenue)}`}
                        className={cn(
                          "flex-1 rounded-t-md transition-[height] duration-500",
                          index === s.monthly.length - 1 ? "bg-lime" : "bg-white/20",
                        )}
                        style={{ height: `${Math.max(6, Math.round((month.revenue / maxMonthly) * 100))}%` }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-white/50">
                    <span>{s.monthly[0]?.label ?? "—"}</span>
                    <span className="text-lime">{s.monthly[s.monthly.length - 1]?.label ?? "—"}</span>
                  </div>
                </HeroCard>

                <div className="grid gap-3 sm:grid-cols-2">
                  <KpiTile tone="lime" icon="trending_up" label="MRR" value={formatCurrency(s.summary.mrr)} note={`ARR projeté : ${formatCurrency(s.summary.arr)}`} valueClassName="text-lg" />
                  <KpiTile
                    tone="sky"
                    icon="savings"
                    label="Depuis le lancement"
                    value={formatCurrency(s.summary.revenueTotal)}
                    note={`${s.summary.paidActivations} encaissement(s) · ${s.summary.payingSchools} école(s)`}
                    valueClassName="text-lg"
                  />
                  <KpiTile
                    tone="amber"
                    icon="hourglass_top"
                    label="Demandes en attente"
                    value={formatCurrency(s.summary.pendingRequestsAmount)}
                    note={`${s.summary.pendingRequests} demande(s) à traiter`}
                    valueClassName="text-lg"
                  />
                  <KpiTile
                    tone="red"
                    icon="report"
                    label="MRR à risque"
                    value={formatCurrency(s.summary.atRiskMrr)}
                    note={`${s.summary.expiredSubscriptions} abonnement(s) expiré(s)`}
                    valueClassName="text-lg"
                  />
                </div>
              </div>

              <Tabs
                label="Sections des finances"
                value={tab}
                onChange={changeTab}
                items={[
                  { id: "vue", label: "Vue d'ensemble", icon: "insights" },
                  { id: "transactions", label: "Transactions", icon: "swap_horiz", badge: allEvents.length },
                  { id: "factures", label: "Factures & reçus", icon: "receipt_long", badge: invoices.length },
                ]}
              />

              {tab === "vue" && <OverviewTab data={s} onOpen={setDetail} />}
              {tab === "transactions" && <TransactionsTab data={s} onOpen={setDetail} />}
              {tab === "factures" && <InvoicesTab invoices={invoices} truncated={s.eventsTruncated ?? false} onOpen={setDetail} />}
            </div>
          );
        }}
      </AsyncView>

      <ReceiptModal event={detail} onClose={() => setDetail(null)} platformName={status.platformName} supportEmail={status.supportEmail} />
      {detail && <PrintableReceipt event={detail} platformName={status.platformName} supportEmail={status.supportEmail} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Vue d'ensemble                                                     */
/* ------------------------------------------------------------------ */

function OverviewTab({ data, onOpen }: { data: AdminFinancesData; onOpen: (event: AdminFinanceEvent) => void }) {
  const maxMethod = Math.max(...data.byMethod.map((m) => m.amount), 1);
  const totalPlanRevenue = data.byPlan.reduce((sum, p) => sum + p.revenue, 0);
  const renewalsDue = data.summary.renewalsDue30;
  const events = data.events ?? data.recentEvents;

  return (
    <div className="space-y-4">
      {data.summary.revenueTotal === 0 && (
        <Notice tone="info">
          <span className="font-bold">Aucun encaissement enregistré pour le moment.</span> Les graphiques et tableaux se rempliront
          automatiquement dès la première activation d'abonnement depuis l'onglet Abonnements. Les formules et leurs tarifs réels sont déjà
          affichés ci-dessous.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <PanelHeading
            icon="insights"
            title="Revenus encaissés sur 12 mois"
            subtitle="Montants réellement perçus lors des activations et renouvellements."
            action={<Badge tone="lime">{formatCurrency(data.monthly.reduce((sum, m) => sum + m.revenue, 0))} sur la période</Badge>}
          />
          <div className="mt-4">
            <RevenueChart data={data.monthly} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniStat label="Ce mois" value={formatCurrency(data.summary.revenueThisMonth)} icon="payments" />
            <MiniStat label="Cumul annuel" value={formatCurrency(data.summary.revenueYtd)} icon="calendar_month" />
            <MiniStat label="Panier moyen / école" value={formatCurrency(data.summary.averagePerPayingSchool)} icon="receipt" />
          </div>
        </Card>

        <Card>
          <PanelHeading icon="account_balance_wallet" title="Moyens de paiement" subtitle="Répartition des encaissements enregistrés." />
          {data.byMethod.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">Aucun encaissement enregistré.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {data.byMethod.map((method) => (
                <div key={method.method}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-ink">{methodLabel(method.method)}</span>
                    <span className="tabular-nums text-neutral-600">{formatCurrency(method.amount)}</span>
                  </div>
                  <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-mist">
                    <div className="h-full rounded-full bg-leaf" style={{ width: `${Math.max((method.amount / maxMethod) * 100, 2)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {method.count} opération(s) · {data.summary.revenueTotal > 0 ? Math.round((method.amount / data.summary.revenueTotal) * 100) : 0} % du total
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 rounded-2xl bg-mist p-4 text-xs leading-relaxed text-neutral-600">
            <strong className="text-ink">Renouvellements sous 30 jours :</strong> {renewalsDue} abonnement(s), soit{" "}
            {formatCurrency(data.summary.renewalsDue30Amount)} de MRR à sécuriser.{" "}
            <button type="button" className="font-semibold text-forest underline" onClick={() => events[0] && onOpen(events[0])} disabled={events.length === 0}>
              Voir le dernier mouvement
            </button>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" padded={false}>
          <div className="px-4 pt-5 sm:px-6">
            <PanelHeading icon="sell" title="Performance par formule" subtitle="Activations, base active et revenus rattachés à chaque formule." />
          </div>
          <div className="px-4 py-4 sm:px-6">
            {data.byPlan.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-500">Aucune formule configurée.</p>
            ) : (
              <Table
                stagger
                caption="Performance financière par formule"
                rows={data.byPlan}
                rowKey={(p) => p.planId}
                columns={[
                  {
                    key: "plan",
                    header: "Formule",
                    render: (p) => (
                      <div>
                        <p className="font-semibold text-ink">{p.name}</p>
                        <p className="text-xs text-neutral-500">{planPriceLabel(p)}</p>
                      </div>
                    ),
                  },
                  { key: "active", header: "Actives", align: "right", render: (p) => <span className="tabular-nums">{p.activeSubscriptions}</span> },
                  { key: "activations", header: "Activations", align: "right", className: "hidden sm:table-cell", render: (p) => <span className="tabular-nums">{p.activations}</span> },
                  { key: "revenue", header: "Encaissé", align: "right", render: (p) => <span className="font-semibold tabular-nums">{formatCurrency(p.revenue)}</span> },
                  {
                    key: "share",
                    header: "Part du CA",
                    align: "right",
                    className: "hidden lg:table-cell",
                    render: (p) => (
                      <div className="min-w-24">
                        <p className="text-xs font-semibold text-neutral-600">
                          {totalPlanRevenue > 0 ? Math.round((p.revenue / totalPlanRevenue) * 100) : 0} %
                        </p>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-mist">
                          <div className="h-full rounded-full bg-forest" style={{ width: `${totalPlanRevenue > 0 ? (p.revenue / totalPlanRevenue) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <PanelHeading icon="swap_horiz" title="Derniers mouvements" subtitle="Journal des activations et renouvellements." />
          {data.recentEvents.length === 0 ? (
            <div className="mt-4">
              <EmptyState icon="receipt_long" title="Aucun mouvement" text="Les encaissements apparaîtront dès la première activation." />
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {data.recentEvents.slice(0, 6).map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onOpen(event)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-neutral-100 p-3 text-left"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-mist text-forest">
                    <Icon name={event.eventType === "renewal" ? "autorenew" : "add_card"} className="text-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{event.schoolName}</span>
                    <span className="block text-xs text-neutral-500">
                      {eventLabel(event.eventType)} · {formatDate(event.createdAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-extrabold tabular-nums text-forest">{formatCurrency(event.amountPaid)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <PanelHeading icon="info" title="Lecture des indicateurs" />
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          Le chiffre d'affaires provient exclusivement du journal <code>subscription_events</code> : chaque activation ou prolongation y
          inscrit le montant réellement encaissé, le moyen de paiement et sa référence. Le MRR est la projection mensuelle des formules
          encore valides aujourd'hui, l'ARR sa projection sur 12 mois. Aucune estimation n'est calculée à partir d'un tarif théorique.
        </p>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-2xl bg-mist p-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-neutral-500">
        <Icon name={icon} className="text-[16px] text-forest" />
        {label}
      </div>
      <p className="mt-1 text-sm font-extrabold tabular-nums text-ink">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Transactions                                                       */
/* ------------------------------------------------------------------ */

function TransactionsTab({ data, onOpen }: { data: AdminFinancesData; onOpen: (event: AdminFinanceEvent) => void }) {
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const events = useMemo(() => data.events ?? data.recentEvents ?? [], [data.events, data.recentEvents]);

  const methods = useMemo(
    () => Array.from(new Set(events.map((e) => e.method).filter(Boolean) as string[])),
    [events],
  );
  const types = useMemo(() => Array.from(new Set(events.map((e) => e.eventType))), [events]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((event) => {
      if (method && event.method !== method) return false;
      if (type && event.eventType !== type) return false;
      if (!term) return true;
      return [event.schoolName, event.matricule, event.planName, event.paymentRef]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [events, method, search, type]);

  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = Boolean(search) || Boolean(method) || Boolean(type);

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-5 sm:px-6">
        <PanelHeading
          icon="swap_horiz"
          title="Journal des transactions"
          subtitle="Chaque ligne correspond à un encaissement réel enregistré par le support."
        />
        {data.eventsTruncated ? <Badge tone="warning">1 000 derniers mouvements</Badge> : <Badge tone="neutral">{events.length} mouvement(s)</Badge>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 pb-4 sm:px-6">
        <Input
          aria-label="Rechercher une transaction"
          placeholder="École, matricule, formule, référence…"
          icon="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full sm:max-w-sm"
        />
        <Select
          aria-label="Filtrer par moyen de paiement"
          value={method}
          onChange={(e) => {
            setMethod(e.target.value);
            setPage(1);
          }}
          options={[{ value: "", label: "Tous les moyens" }, ...methods.map((m) => ({ value: m, label: methodLabel(m) }))]}
          compact
          className="w-full sm:w-48"
        />
        <Select
          aria-label="Filtrer par type de mouvement"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          options={[{ value: "", label: "Tous les types" }, ...types.map((t) => ({ value: t, label: eventLabel(t) }))]}
          compact
          className="w-full sm:w-52"
        />
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            icon="filter_alt_off"
            onClick={() => {
              setSearch("");
              setMethod("");
              setType("");
              setPage(1);
            }}
          >
            Réinitialiser
          </Button>
        )}
      </div>

      <div className="px-4 py-4 sm:px-6">
        {rows.length === 0 ? (
          <EmptyState icon="search_off" title="Aucune transaction" text="Aucun mouvement ne correspond à ces filtres." />
        ) : (
          <>
            <Table
              stagger
              caption="Transactions d'abonnement"
              rows={rows}
              rowKey={(e) => e.id}
              onRowClick={onOpen}
              columns={[
                { key: "date", header: "Date", className: "hidden sm:table-cell", render: (e) => <span className="whitespace-nowrap text-xs text-neutral-600">{formatDateTime(e.createdAt)}</span> },
                {
                  key: "school",
                  header: "Établissement",
                  render: (e) => (
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{e.schoolName}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">{e.matricule || "Sans matricule"}</p>
                    </div>
                  ),
                },
                {
                  key: "type",
                  header: "Type",
                  align: "center",
                  render: (e) => (
                    <Badge tone={EVENT_TONES[e.eventType] ?? "neutral"}>
                      <StatusDot tone={e.eventType === "purchase" ? "success" : e.eventType === "expiration_warning" ? "danger" : "neutral"} />
                      {eventLabel(e.eventType)}
                    </Badge>
                  ),
                },
                { key: "plan", header: "Formule", className: "hidden md:table-cell", render: (e) => <span className="text-sm">{e.planName}</span> },
                {
                  key: "amount",
                  header: "Montant",
                  align: "right",
                  render: (e) => <span className="font-extrabold tabular-nums text-forest">{formatCurrency(e.amountPaid)}</span>,
                },
                { key: "method", header: "Moyen", className: "hidden lg:table-cell", render: (e) => <span className="text-sm">{methodLabel(e.method)}</span> },
                {
                  key: "ref",
                  header: "Référence",
                  className: "hidden xl:table-cell",
                  render: (e) => <span className="font-mono text-xs text-neutral-500">{e.paymentRef || "—"}</span>,
                },
              ]}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
          </>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Factures & reçus                                                   */
/* ------------------------------------------------------------------ */

function InvoicesTab({
  invoices,
  truncated,
  onOpen,
}: {
  invoices: AdminFinanceEvent[];
  truncated: boolean;
  onOpen: (event: AdminFinanceEvent) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const term = search.trim().toLowerCase();

  const filtered = invoices.filter((invoice) =>
    term ? [invoice.schoolName, invoice.matricule, receiptNumber(invoice), invoice.planName].some((v) => String(v ?? "").toLowerCase().includes(term)) : true,
  );
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const total = filtered.reduce((sum, invoice) => sum + invoice.amountPaid, 0);

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-5 sm:px-6">
        <PanelHeading
          icon="receipt_long"
          title="Factures & reçus"
          subtitle="Pièces justificatives générées à partir des encaissements confirmés."
        />
        <Badge tone="lime">{formatCurrency(total)} facturé</Badge>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 pb-4 sm:px-6">
        <Input
          aria-label="Rechercher une pièce"
          placeholder="Numéro, école ou matricule…"
          icon="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full sm:max-w-sm"
        />
        <p className="text-xs text-neutral-500">
          {invoices.length} reçu(s) disponible(s){truncated ? " — journal plafonné aux 1 000 derniers mouvements." : "."}
        </p>
      </div>

      <div className="px-4 py-4 sm:px-6">
        {rows.length === 0 ? (
          <EmptyState icon="receipt_long" title="Aucune pièce" text="Les reçus apparaissent dès qu'un encaissement est enregistré." />
        ) : (
          <>
            <Table
              stagger
              caption="Factures et reçus d'abonnement"
              rows={rows}
              rowKey={(e) => e.id}
              onRowClick={onOpen}
              columns={[
                { key: "number", header: "N° de pièce", render: (e) => <span className="whitespace-nowrap font-mono text-xs font-semibold text-forest">{receiptNumber(e)}</span> },
                { key: "date", header: "Date", className: "hidden sm:table-cell", render: (e) => <span className="whitespace-nowrap text-xs text-neutral-600">{formatDate(e.createdAt)}</span> },
                {
                  key: "school",
                  header: "Établissement",
                  render: (e) => (
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{e.schoolName}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">{e.matricule || "Sans matricule"}</p>
                    </div>
                  ),
                },
                { key: "plan", header: "Formule", className: "hidden md:table-cell", render: (e) => <span className="text-sm">{e.planName}</span> },
                {
                  key: "period",
                  header: "Période couverte",
                  className: "hidden lg:table-cell",
                  render: (e) => (
                    <span className="whitespace-nowrap text-xs text-neutral-600">
                      {formatDate(e.startsAt)} → {formatDate(e.endsAt)}
                    </span>
                  ),
                },
                { key: "amount", header: "Montant", align: "right", render: (e) => <span className="font-extrabold tabular-nums text-forest">{formatCurrency(e.amountPaid)}</span> },
                {
                  key: "actions",
                  header: "",
                  align: "right",
                  render: (e) => (
                    <Button size="sm" variant="outline" icon="visibility" onClick={() => onOpen(e)}>
                      Voir
                    </Button>
                  ),
                },
              ]}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
          </>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Reçu                                                               */
/* ------------------------------------------------------------------ */

function ReceiptModal({
  event,
  onClose,
  platformName,
  supportEmail,
}: {
  event: AdminFinanceEvent | null;
  onClose: () => void;
  platformName: string;
  supportEmail: string;
}) {
  return (
    <Modal
      open={!!event}
      onClose={onClose}
      title="Pièce justificative"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button icon="print" onClick={() => window.print()} disabled={!event}>
            Imprimer le reçu
          </Button>
        </>
      }
    >
      {event && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-forest p-4 text-white">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-white/60">{platformName}</p>
              <p className="mt-1 font-mono text-lg font-extrabold text-lime">{receiptNumber(event)}</p>
            </div>
            <Badge tone={EVENT_TONES[event.eventType] ?? "neutral"}>{eventLabel(event.eventType)}</Badge>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Établissement" value={event.schoolName} />
            <Detail label="Matricule" value={event.matricule || "—"} mono />
            <Detail label="Formule" value={event.planName} />
            <Detail label="Moyen de paiement" value={methodLabel(event.method)} />
            <Detail label="Période couverte" value={`${formatDate(event.startsAt)} → ${formatDate(event.endsAt)}`} />
            <Detail label="Enregistré le" value={formatDateTime(event.createdAt)} />
            <Detail label="Référence de paiement" value={event.paymentRef || "—"} mono />
            <Detail label="Identifiant interne" value={event.id} mono />
          </dl>

          <div className="flex items-center justify-between rounded-2xl bg-lime-soft px-4 py-3">
            <span className="text-sm font-semibold text-forest">Montant encaissé</span>
            <span className="text-xl font-extrabold tabular-nums text-forest">{formatCurrency(event.amountPaid)}</span>
          </div>

          <p className="text-xs leading-relaxed text-neutral-500">
            Ce document atteste l'encaissement enregistré dans le journal des abonnements {platformName}. Pour toute question, contactez{" "}
            {supportEmail}.
          </p>
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-100 px-3 py-2">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className={cn("mt-0.5 break-words text-sm text-ink", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

/** Bloc rendu exclusivement à l'impression (voir `.print-only` dans index.css). */
function PrintableReceipt({ event, platformName, supportEmail }: { event: AdminFinanceEvent; platformName: string; supportEmail: string }) {
  return (
    <div className="print-area print-only absolute left-0 top-0 w-full bg-white p-8 text-ink">
      <div className="flex items-start justify-between border-b border-neutral-300 pb-4">
        <div>
          <p className="text-2xl font-extrabold text-forest">{platformName}</p>
          <p className="text-xs text-neutral-500">Plateforme de gestion scolaire</p>
          <p className="text-xs text-neutral-500">{supportEmail}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">REÇU D'ABONNEMENT</p>
          <p className="font-mono text-sm">{receiptNumber(event)}</p>
          <p className="text-xs text-neutral-500">Émis le {formatDate(event.createdAt)}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-bold uppercase text-neutral-500">Établissement</p>
          <p className="font-semibold">{event.schoolName}</p>
          <p className="text-xs text-neutral-500">Matricule : {event.matricule || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-neutral-500">Mouvement</p>
          <p className="font-semibold">{eventLabel(event.eventType)}</p>
          <p className="text-xs text-neutral-500">Référence : {event.paymentRef || "—"}</p>
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-neutral-100 text-left">
            <th className="border border-neutral-300 px-3 py-2">Formule</th>
            <th className="border border-neutral-300 px-3 py-2">Période</th>
            <th className="border border-neutral-300 px-3 py-2">Moyen</th>
            <th className="border border-neutral-300 px-3 py-2 text-right">Montant</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-neutral-300 px-3 py-2">{event.planName}</td>
            <td className="border border-neutral-300 px-3 py-2">
              {formatDate(event.startsAt)} → {formatDate(event.endsAt)}
            </td>
            <td className="border border-neutral-300 px-3 py-2">{methodLabel(event.method)}</td>
            <td className="border border-neutral-300 px-3 py-2 text-right font-semibold">{formatCurrency(event.amountPaid)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="border border-neutral-300 px-3 py-2 text-right font-bold">
              Total encaissé
            </td>
            <td className="border border-neutral-300 px-3 py-2 text-right font-extrabold">{formatCurrency(event.amountPaid)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-6 text-xs text-neutral-500">
        Ce reçu atteste l'encaissement enregistré dans le journal des abonnements {platformName}. Document généré automatiquement.
      </p>
    </div>
  );
}
