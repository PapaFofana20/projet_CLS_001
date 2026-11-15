// Liste et gestion de tous les établissements côté admin.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { AsyncView } from "@/components/ui/AsyncView";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { useAsync } from "@/hooks/useAsync";
import { useDebounce } from "@/hooks/useDebounce";
import {
  getAdminOverviewStats,
  listAdminSchools,
  setAdminSchoolStatus,
  deleteAdminSchool,
  type ListSchoolsParams,
  type ListSchoolsResult,
} from "@/services/admin";
import type { AdminOverviewStats, AdminSchool } from "@/types";
import { formatDate, formatNumber } from "@/utils/format";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { cn } from "@/utils/cn";

type StatusFilter = "all" | "ACTIF" | "SUSPENDUE";
type SortKey = "recent" | "name" | "city" | "matricule";

// Tri proposé dans la barre de filtres (le backend n'accepte que ces colonnes).
const SORTS: Record<SortKey, { sortBy: string; sortDir: "asc" | "desc"; label: string }> = {
  recent: { sortBy: "created_at", sortDir: "desc", label: "Plus récents" },
  name: { sortBy: "name", sortDir: "asc", label: "Nom (A → Z)" },
  city: { sortBy: "city", sortDir: "asc", label: "Ville (A → Z)" },
  matricule: { sortBy: "matricule", sortDir: "asc", label: "Matricule (A → Z)" },
};

const CYCLE_LABELS: Record<string, string> = {
  elementaire: "Élémentaire",
  moyen: "Moyen",
  secondaire: "Secondaire",
};

const CYCLE_TONES: Record<string, string> = {
  elementaire: "bg-lime-soft text-forest",
  moyen: "bg-sky-100 text-sky-800",
  secondaire: "bg-amber-100 text-amber-900",
};

// Boutons d'action de chaque ligne, compacts et cerclés.
const ACTION_BTN = "grid size-9 place-items-center rounded-full text-neutral-500 transition";

// Composant principal de la page.
export default function AdminSchoolsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [status, setStatus] = useState<StatusFilter>((searchParams.get("status") as StatusFilter) ?? "all");
  const [sort, setSort] = useState<SortKey>((searchParams.get("sort") as SortKey) ?? "recent");
  const [page, setPageState] = useState(Math.max(1, parseInt(searchParams.get("page") ?? "1", 10)));
  const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get("pageSize") ?? "20", 10)));

  // La frappe n'appelle l'API qu'une fois stabilisée.
  const debouncedSearch = useDebounce(search, 300);
  const sortDef = SORTS[sort] ?? SORTS.recent;

  const params: ListSchoolsParams = {
    page,
    pageSize,
    search: debouncedSearch || undefined,
    status: status === "all" ? null : status,
    sortBy: sortDef.sortBy,
    sortDir: sortDef.sortDir,
  };

  const state = useAsync(() => listAdminSchools(params), [page, pageSize, debouncedSearch, status, sort]);
  // Compteurs globaux (actifs / suspendus / effectifs) : chargés une seule fois.
  const statsState = useAsync(() => getAdminOverviewStats(), []);

  const updateQuery = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === undefined) next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next);
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setPageState(1);
    updateQuery({ search: value || null, page: "1" });
  };

  const changeStatus = (value: StatusFilter) => {
    setStatus(value);
    setPageState(1);
    updateQuery({ status: value === "all" ? null : value, page: "1" });
  };

  const changeSort = (value: SortKey) => {
    setSort(value);
    updateQuery({ sort: value === "recent" ? null : value });
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setSort("recent");
    setPageState(1);
    setSearchParams(new URLSearchParams());
  };

  return (
    <>
      <PageHeader
        title="Gestion des établissements"
        subtitle="Pilotez le réseau d'écoles : statuts, cycles et accès à la plateforme."
        actions={
          <LinkButton to="/admin/abonnements" variant="outline" icon="workspace_premium">
            Abonnements
          </LinkButton>
        }
      />

      <div className="space-y-4">
        <NetworkOverview stats={statsState.data} unavailable={Boolean(statsState.error)} />

        <AsyncView state={state}>
          {(s) => (
            <Content
              s={s}
              stats={statsState.data}
              search={search}
              status={status}
              sort={sort}
              onSearch={changeSearch}
              onStatus={changeStatus}
              onSort={changeSort}
              onReset={resetFilters}
              updateQuery={updateQuery}
              setPageState={setPageState}
              reload={state.reload}
              statsReload={statsState.reload}
            />
          )}
        </AsyncView>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Bandeau de synthèse du réseau                                      */
/* ------------------------------------------------------------------ */

function NetworkOverview({ stats, unavailable }: { stats: AdminOverviewStats | null; unavailable: boolean }) {
  const schools = stats?.schools;
  const people = stats?.people;
  const total = schools?.total;
  const active = schools?.active;
  const suspended = schools?.suspended;
  const activePct = total && active !== undefined ? Math.round((active / total) * 100) : null;
  const suspendedPct = activePct === null ? null : 100 - activePct;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      {/* Carte foncée : le réseau en un coup d'œil */}
      <div className="relative overflow-hidden rounded-3xl bg-forest p-6 text-white shadow-soft">
        <div
          className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(currentColor_1.4px,transparent_1.4px)] [background-size:18px_18px]"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-lime/25 blur-3xl" aria-hidden="true" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-lime">Réseau Classora</p>
            <p className="mt-3 text-4xl font-extrabold leading-none tabular-nums sm:text-5xl">{total === undefined ? "—" : formatNumber(total)}</p>
            <p className="mt-2 text-sm text-white/70">
              établissement{total === 1 ? "" : "s"} enregistré{total === 1 ? "" : "s"} sur la plateforme
            </p>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-lime">
            <Icon name="school" fill className="text-[26px]" />
          </span>
        </div>

        <div className="relative mt-6 space-y-2">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
            <span className="h-full rounded-full bg-lime transition-[width] duration-500" style={{ width: `${activePct ?? 0}%` }} />
            <span className="h-full rounded-full bg-red-300/80 transition-[width] duration-500" style={{ width: `${suspendedPct ?? 0}%` }} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-white/75">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-lime" />
              {active === undefined ? "—" : formatNumber(active)} actif{active === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-red-300" />
              {suspended === undefined ? "—" : formatNumber(suspended)} suspendu{suspended === 1 ? "" : "s"}
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-lime">
              <Icon name="trending_up" className="text-[14px]" />
              {activePct === null ? "—" : `${activePct} % opérationnels`}
            </span>
          </div>
        </div>

        <p className="relative mt-4 text-[11px] font-medium text-white/45">
          {stats ? `Données au ${formatDate(stats.generatedAt)}` : unavailable ? "Statistiques indisponibles pour le moment." : "Chargement des statistiques…"}
        </p>
      </div>

      {/* Mini cartes colorées */}
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniKpi
          icon="verified"
          label="Écoles actives"
          value={active}
          note="Inscriptions ouvertes"
          className="bg-lime-soft text-forest"
          iconClassName="bg-white/70 text-forest"
        />
        <MiniKpi
          icon="block"
          label="Écoles suspendues"
          value={suspended}
          note="Accès restreint"
          className="bg-red-50 text-red-900"
          iconClassName="bg-white text-danger"
        />
        <MiniKpi
          icon="groups"
          label="Élèves suivis"
          value={people?.totalStudents}
          note="Toutes écoles confondues"
          className="bg-sky-50 text-sky-950"
          iconClassName="bg-white text-sky-700"
        />
        <MiniKpi
          icon="badge"
          label="Enseignants"
          value={people?.totalTeachers}
          note="Professeurs et instituteurs"
          className="bg-amber-50 text-amber-950"
          iconClassName="bg-white text-amber-700"
        />
      </div>
    </div>
  );
}

function MiniKpi({
  icon,
  label,
  value,
  note,
  className,
  iconClassName,
}: {
  icon: string;
  label: string;
  value?: number;
  note: string;
  className: string;
  iconClassName: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl p-4 shadow-card transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-soft", className)}>
      <div className="flex items-center gap-2">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", iconClassName)}>
          <Icon name={icon} fill className="text-[18px]" />
        </span>
        <p className="text-[11px] font-bold uppercase tracking-wide opacity-75">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-extrabold leading-none tabular-nums">{value === undefined ? "—" : formatNumber(value)}</p>
      <p className="mt-1 text-xs opacity-70">{note}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contenu : filtres, annuaire et actions                             */
/* ------------------------------------------------------------------ */

function Content({
  s,
  stats,
  search,
  status,
  sort,
  onSearch,
  onStatus,
  onSort,
  onReset,
  updateQuery,
  setPageState,
  reload,
  statsReload,
}: {
  s: ListSchoolsResult;
  stats: AdminOverviewStats | null;
  search: string;
  status: StatusFilter;
  sort: SortKey;
  onSearch: (value: string) => void;
  onStatus: (value: StatusFilter) => void;
  onSort: (value: SortKey) => void;
  onReset: () => void;
  updateQuery: (u: Record<string, string | null>) => void;
  setPageState: (p: number) => void;
  reload: () => void;
  statsReload: () => void;
}) {
  const { isSuperAdmin } = useAdminAuth();

  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [statusTarget, setStatusTarget] = useState<AdminSchool | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminSchool | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const hasFilters = Boolean(search) || status !== "all" || sort !== "recent";
  const pageCount = Math.max(1, Math.ceil(s.total / s.pageSize));

  // H-4 : confirmation par matricule uniquement (le nom est public et devinable).
  const expectedConfirmation = (school: AdminSchool) => school.matricule ?? "";

  const refreshAll = () => {
    reload();
    statsReload();
  };

  const toggleStatus = async () => {
    if (!statusTarget) return;
    const newStatus = statusTarget.registrationOpen ? "SUSPENDUE" : "ACTIF";
    setActionError("");
    setBusy(true);
    try {
      await setAdminSchoolStatus({ schoolId: statusTarget.id, status: newStatus });
      setStatusMsg({ type: "success", text: `Établissement ${newStatus === "ACTIF" ? "activé" : "suspendu"} avec succès.` });
      setStatusTarget(null);
      refreshAll();
    } catch (e: any) {
      setActionError(e.message || "Erreur lors du changement de statut.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActionError("");
    setBusy(true);
    try {
      await deleteAdminSchool({ schoolId: deleteTarget.id, confirmation: deleteConfirm });
      setStatusMsg({ type: "success", text: `Établissement ${deleteTarget.name} supprimé définitivement.` });
      setDeleteTarget(null);
      setDeleteConfirm("");
      refreshAll();
    } catch (e: any) {
      setActionError(e.message || "Erreur lors de la suppression.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm",
            statusMsg.type === "success" ? "border-emerald-100 bg-emerald-50 text-emerald-900" : "border-red-100 bg-red-50 text-danger",
          )}
        >
          <Icon
            name={statusMsg.type === "success" ? "check_circle" : "error"}
            fill
            className={cn("mt-0.5 text-[20px]", statusMsg.type === "success" ? "text-emerald-600" : "text-danger")}
          />
          <span className="flex-1">{statusMsg.text}</span>
          <button type="button" onClick={() => setStatusMsg(null)} aria-label="Fermer le message" className="opacity-60 transition hover:opacity-100">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
      )}

      <Card padded={false} className="overflow-hidden">
        {/* En-tête de l'annuaire */}
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <span className="grid size-9 place-items-center rounded-xl bg-lime-soft text-forest">
                <Icon name="domain" fill className="text-[20px]" />
              </span>
              Annuaire des établissements
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {s.total === 0
                ? "Aucun établissement ne correspond aux filtres."
                : `${formatNumber(s.total)} établissement${s.total > 1 ? "s" : ""} · page ${s.page} sur ${pageCount}`}
            </p>
          </div>
          <Badge tone={isSuperAdmin ? "dark" : "neutral"}>
            <Icon name={isSuperAdmin ? "verified_user" : "visibility"} className="text-[14px]" />
            {isSuperAdmin ? "Gestion complète" : "Consultation"}
          </Badge>
        </div>

        {/* Filtres */}
        <div className="mt-4 space-y-3 border-b border-neutral-100 px-4 pb-4 sm:px-6">
          <Tabs
            label="Filtrer les établissements par statut"
            value={status}
            onChange={(id) => onStatus(id as StatusFilter)}
            items={[
              { id: "all", label: "Tous", icon: "apps", badge: stats?.schools.total ?? s.total },
              { id: "ACTIF", label: "Actifs", icon: "verified", badge: stats?.schools.active },
              { id: "SUSPENDUE", label: "Suspendus", icon: "block", badge: stats?.schools.suspended },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Rechercher un établissement"
              placeholder="Rechercher un nom, un matricule, une ville…"
              icon="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full sm:max-w-md"
            />
            <Select
              aria-label="Trier les établissements"
              value={sort}
              onChange={(e) => onSort(e.target.value as SortKey)}
              options={Object.entries(SORTS).map(([value, def]) => ({ value, label: def.label }))}
              compact
              className="w-full sm:w-52"
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" icon="filter_alt_off" onClick={onReset}>
                Réinitialiser
              </Button>
            )}
          </div>
        </div>

        {/* Annuaire */}
        <div className="px-4 py-4 sm:px-6">
          {s.schools.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-mist/60 px-6 py-12 text-center">
              <span className="mb-3 grid size-14 place-items-center rounded-full bg-white text-forest shadow-card">
                <Icon name="search_off" className="text-[28px]" />
              </span>
              <h3 className="text-base font-bold text-ink">Aucun établissement trouvé</h3>
              <p className="mt-1 max-w-md text-sm text-neutral-500">
                Modifiez la recherche ou le filtre de statut pour retrouver une école du réseau.
              </p>
              <Button className="mt-4" variant="outline" icon="filter_alt_off" onClick={onReset}>
                Réinitialiser les filtres
              </Button>
            </div>
          ) : (
            <>
              <Table
                columns={[
                  {
                    key: "name",
                    header: "Établissement",
                    render: (r: AdminSchool) => (
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            "grid size-11 shrink-0 place-items-center rounded-2xl text-base font-extrabold",
                            r.registrationOpen ? "bg-lime-soft text-forest" : "bg-neutral-100 text-neutral-500",
                          )}
                          aria-hidden="true"
                        >
                          {r.name.trim().charAt(0).toUpperCase() || "?"}
                        </span>
                        <div className="min-w-0">
                          <Link
                            to={`/admin/ecoles/${r.id}`}
                            className="block truncate font-semibold text-ink underline-offset-4 hover:text-forest hover:underline"
                          >
                            {r.name}
                          </Link>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500">
                            <Icon name="location_on" className="text-[14px]" />
                            {r.city || "Ville non renseignée"}
                          </p>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "matricule",
                    header: "Matricule",
                    render: (r: AdminSchool) => (
                      <span className="inline-flex whitespace-nowrap rounded-lg bg-mist px-2 py-1 font-mono text-[11px] font-semibold tabular-nums text-neutral-600">
                        {r.matricule || "—"}
                      </span>
                    ),
                  },
                  {
                    key: "cycles",
                    header: "Cycles",
                    // Les pastilles restent dans les cartes mobiles, mais s'effacent
                    // sur les largeurs intermédiaires pour laisser place aux actions.
                    className: "hidden lg:table-cell",
                    render: (r: AdminSchool) => (
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {r.cycles.length === 0 ? (
                          <span className="text-xs text-neutral-400">—</span>
                        ) : (
                          r.cycles.map((cycle) => (
                            <span
                              key={cycle}
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                CYCLE_TONES[cycle] ?? "bg-neutral-100 text-neutral-600",
                              )}
                            >
                              {CYCLE_LABELS[cycle] ?? cycle}
                            </span>
                          ))
                        )}
                      </div>
                    ),
                  },
                  {
                    key: "createdAt",
                    header: "Créé le",
                    // Masquée sur les écrans étroits : les actions de ligne doivent rester visibles.
                    className: "hidden xl:table-cell",
                    render: (r: AdminSchool) => <span className="text-xs tabular-nums text-neutral-500">{formatDate(r.createdAt)}</span>,
                  },
                  {
                    key: "status",
                    header: "Statut",
                    align: "center",
                    render: (r: AdminSchool) => {
                      // Le badge reflète l'état que les boutons modifient
                      // (registration_open). L'ancien test « matricule && open »
                      // affichait « Suspendu » à toute école sans matricule.
                      return (
                        <Badge tone={r.registrationOpen ? "success" : "danger"}>
                          <span className={cn("size-1.5 rounded-full", r.registrationOpen ? "bg-emerald-600" : "bg-red-600")} aria-hidden="true" />
                          {r.registrationOpen ? "Actif" : "Suspendu"}
                        </Badge>
                      );
                    },
                  },
                  ...(isSuperAdmin
                    ? [
                        {
                          key: "actions",
                          header: "Actions",
                          align: "center" as const,
                          render: (r: AdminSchool) => (
                            <div className="inline-flex items-center gap-0.5 rounded-full bg-mist/70 p-1">
                              <Link
                                to={`/admin/ecoles/${r.id}`}
                                title="Ouvrir la fiche de l'établissement"
                                aria-label={`Ouvrir la fiche de ${r.name}`}
                                className={cn(ACTION_BTN, "hover:bg-white hover:text-forest hover:shadow-card")}
                              >
                                <Icon name="visibility" className="text-[20px]" />
                              </Link>
                              <button
                                type="button"
                                title={r.registrationOpen ? "Suspendre cet établissement" : "Réactiver cet établissement"}
                                aria-label={r.registrationOpen ? `Suspendre ${r.name}` : `Réactiver ${r.name}`}
                                onClick={() => {
                                  setActionError("");
                                  setStatusTarget(r);
                                }}
                                className={cn(
                                  ACTION_BTN,
                                  r.registrationOpen
                                    ? "hover:bg-amber-50 hover:text-amber-700"
                                    : "hover:bg-emerald-50 hover:text-emerald-700",
                                )}
                              >
                                <Icon name={r.registrationOpen ? "pause" : "play_arrow"} className="text-[20px]" />
                              </button>
                              <button
                                type="button"
                                title="Supprimer définitivement cet établissement"
                                aria-label={`Supprimer définitivement ${r.name}`}
                                onClick={() => {
                                  setActionError("");
                                  setDeleteConfirm("");
                                  setDeleteTarget(r);
                                }}
                                className={cn(ACTION_BTN, "text-danger/70 hover:bg-red-50 hover:text-danger")}
                              >
                                <Icon name="delete" className="text-[20px]" />
                              </button>
                            </div>
                          ),
                        },
                      ]
                    : []),
                ]}
                rows={s.schools}
                rowKey={(r: AdminSchool) => r.id}
                caption="Liste des établissements scolaires"
                stagger
              />

              <Pagination
                page={s.page}
                pageSize={s.pageSize}
                total={s.total}
                onChange={(p) => {
                  setPageState(p);
                  updateQuery({ page: String(p) });
                }}
              />
            </>
          )}
        </div>
      </Card>

      {/* Suspension / réactivation */}
      <Modal
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        title={statusTarget?.registrationOpen ? "Suspendre l'établissement" : "Activer l'établissement"}
        size="sm"
      >
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-mist p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-forest shadow-card">
            <Icon name="school" fill className="text-[20px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{statusTarget?.name}</p>
            <p className="text-xs text-neutral-500">
              {statusTarget?.matricule || "Sans matricule"} · {statusTarget?.city || "Ville non renseignée"}
            </p>
          </div>
          <Badge tone={statusTarget?.registrationOpen ? "success" : "danger"} className="ml-auto">
            {statusTarget?.registrationOpen ? "Actif" : "Suspendu"}
          </Badge>
        </div>
        <p className="mb-4">
          Voulez-vous vraiment {statusTarget?.registrationOpen ? "suspendre" : "réactiver"} l'établissement{" "}
          <strong>{statusTarget?.name}</strong> ?
          {statusTarget?.registrationOpen && " Une école suspendue n'inscrit plus de nouveaux élèves et ses données deviennent inaccessibles."}
        </p>
        {actionError && (
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-danger">
            <Icon name="error" className="text-[20px]" />
            {actionError}
          </p>
        )}
        <div className="flex justify-end gap-3" slot="footer">
          <Button variant="outline" onClick={() => setStatusTarget(null)} disabled={busy}>
            Annuler
          </Button>
          <Button variant={statusTarget?.registrationOpen ? "danger" : "primary"} onClick={toggleStatus} loading={busy}>
            {statusTarget?.registrationOpen ? "Suspendre" : "Activer"}
          </Button>
        </div>
      </Modal>

      {/* Suppression définitive (confirmation par matricule ou nom) */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Supprimer définitivement l'établissement" size="sm">
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <Icon name="warning" fill className="text-[20px]" />
            Cette action est irréversible.
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            Seront définitivement supprimés : l'établissement <strong>{deleteTarget?.name}</strong>, ses élèves, classes,
            enseignants, parents, abonnements, messages, ainsi que tous les comptes de connexion associés.
          </p>
        </div>
        {actionError && (
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-danger">
            <Icon name="error" className="text-[20px]" />
            {actionError}
          </p>
        )}
        {deleteTarget?.matricule ? (
          <Input
            label="Tapez la matricule de l'établissement pour confirmer"
            hint={`Matricule attendue : ${deleteTarget.matricule}`}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={deleteTarget.matricule}
            autoComplete="off"
          />
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Cet établissement n'a pas de matricule : la suppression est bloquée. Attribuez d'abord une matricule.
          </p>
        )}
        <div className="flex justify-end gap-3" slot="footer">
          <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={confirmDelete}
            loading={busy}
            disabled={!deleteTarget || deleteConfirm !== expectedConfirmation(deleteTarget)}
          >
            Supprimer définitivement
          </Button>
        </div>
      </Modal>
    </div>
  );
}
