// Gestion des agents de l'administration Classora.
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AsyncView } from "@/components/ui/AsyncView";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAsync } from "@/hooks/useAsync";
import {
  listAdminAgents,
  createAdminAgent,
  type AdminAgent,
  type AdminAgentRole,
  type CreateAdminAgentInput,
} from "@/services/admin";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/utils/format";
import {
  EntityAvatar,
  HeroBar,
  HeroCard,
  HeroLegend,
  KpiTile,
  MonoChip,
  Notice,
  PanelHeading,
  StatusDot,
} from "@/features/admin/adminUi";

type StatusFilter = "all" | "ACTIF" | "EN_ATTENTE" | "DESACTIVE";

const ROLE_LABELS: Record<AdminAgentRole, string> = {
  superadmin: "Superadmin",
  admin: "Administrateur",
  agent_suivi: "Agent de suivi",
};

const ROLE_TONES: Record<AdminAgentRole, "dark" | "lime" | "neutral"> = {
  superadmin: "dark",
  admin: "lime",
  agent_suivi: "neutral",
};

const STATUS_LABELS: Record<AdminAgent["status"], string> = {
  ACTIF: "Actif",
  EN_ATTENTE: "En attente",
  DESACTIVE: "Désactivé",
};

const STATUS_TONES: Record<AdminAgent["status"], "success" | "warning" | "neutral"> = {
  ACTIF: "success",
  EN_ATTENTE: "warning",
  DESACTIVE: "neutral",
};

// Composant principal de la page.
export default function AdminAgentsPage() {
  const { isSuperAdmin } = useAdminAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateAdminAgentInput>({
    role: "agent_suivi",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const state = useAsync(() => listAdminAgents(), []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      const created = await createAdminAgent(form);
      setStatusMsg({
        type: "success",
        text: `Agent créé — matricule ${created.matricule}. Il peut se connecter sur /admin/connexion avec cette matricule ou ${created.email}, et son mot de passe.`,
      });
      setShowCreate(false);
      setForm({ role: "agent_suivi", firstName: "", lastName: "", email: "", phone: "", password: "" });
      state.reload();
    } catch (e: any) {
      setCreateError(e.message || "Erreur lors de la création de l'agent.");
    } finally {
      setCreating(false);
    }
  };

  // Seul un superadministrateur peut voir et gérer les agents.
  if (!isSuperAdmin) {
    return (
      <Card>
        <PanelHeading icon="lock" title="Accès réservé" subtitle="Seul le superadministrateur peut gérer les agents." />
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-mist p-4 text-sm text-neutral-600">
          <Icon name="verified_user" fill className="text-[22px] text-forest" />
          Cette section est protégée par le contrôle d'accès de la console.
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Gestion des agents Classora"
        subtitle="Profils, matricules, rôles et statuts des agents administratifs"
        actions={
          <Button variant="primary" icon="person_add" onClick={() => setShowCreate(true)}>
            Nouvel agent
          </Button>
        }
      />

      {statusMsg && (
        <Notice className="mb-4" tone={statusMsg.type === "success" ? "success" : "error"} onClose={() => setStatusMsg(null)}>
          {statusMsg.text}
        </Notice>
      )}

      <AsyncView state={state}>{(s: { agents: AdminAgent[] }) => <Content agents={s.agents} />}</AsyncView>

      <Modal
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setCreateError("");
        }}
        title="Nouvel agent administratif"
        size="md"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-danger">{createError}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Rôle"
              required
              value={form.role}
              options={[
                { value: "superadmin", label: "Superadministrateur" },
                { value: "admin", label: "Administrateur" },
                { value: "agent_suivi", label: "Agent de suivi" },
              ]}
              onChange={(e) => setForm({ ...form, role: e.target.value as AdminAgentRole })}
            />
            <Input label="Prénom" required placeholder="Ex. Aminata" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Input label="Nom" required placeholder="Ex. Diop" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <Input label="E-mail" type="email" required placeholder="vous@exemple.sn" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Téléphone" placeholder="77 123 45 67" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input
              label="Mot de passe"
              type="password"
              required
              autoComplete="new-password"
              placeholder="••••••••"
              className="sm:col-span-2"
              hint="Mot de passe fixe de l'agent : il servira à chaque connexion. 8 caractères minimum, avec majuscule, minuscule et chiffre."
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <p className="rounded-xl bg-mist px-3 py-2 text-xs text-neutral-600">
            Un matricule au format <code className="font-semibold text-forest">CLA-ADM-000001</code> sera généré automatiquement.
          </p>
          <div className="flex justify-end gap-3" slot="footer">
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Annuler
            </Button>
            <Button variant="primary" type="submit" loading={creating} icon="person_add">
              Créer l'agent
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Content({ agents }: { agents: AdminAgent[] }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");

  const active = agents.filter((a) => a.status === "ACTIF").length;
  const pending = agents.filter((a) => a.status === "EN_ATTENTE").length;
  const disabled = agents.filter((a) => a.status === "DESACTIVE").length;
  const superadmins = agents.filter((a) => a.role === "superadmin").length;
  const admins = agents.filter((a) => a.role === "admin").length;
  const followers = agents.filter((a) => a.role === "agent_suivi").length;
  const activePct = agents.length > 0 ? Math.round((active / agents.length) * 100) : 0;

  const term = search.trim().toLowerCase();
  const filtered = agents.filter((agent) => {
    if (status !== "all" && agent.status !== status) return false;
    if (role && agent.role !== role) return false;
    if (!term) return true;
    return [agent.firstName, agent.lastName, agent.email, agent.matricule, agent.phone]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });
  const hasFilters = status !== "all" || Boolean(role) || Boolean(search);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <HeroCard
          eyebrow="Équipe administrative"
          icon="verified_user"
          value={agents.length}
          label={`agent${agents.length > 1 ? "s" : ""} enregistré${agents.length > 1 ? "s" : ""} sur la console Classora`}
          footnote="Comptes créés par le superadministrateur"
        >
          <HeroBar
            segments={[
              { pct: (active / Math.max(agents.length, 1)) * 100, className: "bg-lime" },
              { pct: (pending / Math.max(agents.length, 1)) * 100, className: "bg-amber-300/90" },
              { pct: (disabled / Math.max(agents.length, 1)) * 100, className: "bg-white/25" },
            ]}
          />
          <HeroLegend
            items={[
              { dot: "bg-lime", label: `${active} actif(s)` },
              { dot: "bg-amber-300", label: `${pending} en attente` },
              { dot: "bg-white/40", label: `${disabled} désactivé(s)` },
            ]}
            trailing={
              <>
                <Icon name="shield" className="text-[14px]" />
                {activePct} % opérationnels
              </>
            }
          />
        </HeroCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <KpiTile tone="violet" icon="admin_panel_settings" label="Superadmins" value={superadmins} note="Accès complet à la console" />
          <KpiTile tone="lime" icon="manage_accounts" label="Administrateurs" value={admins} note="Gestion des établissements" />
          <KpiTile tone="sky" icon="support_agent" label="Agents de suivi" value={followers} note="Consultation et assistance" />
          <KpiTile
            tone={pending + disabled > 0 ? "amber" : "neutral"}
            icon="hourglass_top"
            label="À traiter"
            value={pending + disabled}
            note={`${pending} en attente · ${disabled} désactivé(s)`}
          />
        </div>
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-5 sm:px-6">
          <PanelHeading icon="groups" title="Annuaire des agents" subtitle="Recherchez un profil, filtrez par rôle ou par statut." />
          <Badge tone="neutral">{filtered.length} agent(s)</Badge>
        </div>

        <div className="mt-4 space-y-3 border-b border-neutral-100 px-4 pb-4 sm:px-6">
          <Tabs
            label="Filtrer les agents par statut"
            value={status}
            onChange={(id) => setStatus(id as StatusFilter)}
            items={[
              { id: "all", label: "Tous", icon: "groups", badge: agents.length },
              { id: "ACTIF", label: "Actifs", icon: "verified", badge: active },
              { id: "EN_ATTENTE", label: "En attente", icon: "hourglass_top", badge: pending },
              { id: "DESACTIVE", label: "Désactivés", icon: "person_off", badge: disabled },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Rechercher un agent"
              placeholder="Nom, e-mail, matricule…"
              icon="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:max-w-md"
            />
            <Select
              aria-label="Filtrer par rôle"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              options={[
                { value: "", label: "Tous les rôles" },
                { value: "superadmin", label: "Superadmin" },
                { value: "admin", label: "Administrateur" },
                { value: "agent_suivi", label: "Agent de suivi" },
              ]}
              compact
              className="w-full sm:w-52"
            />
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                icon="filter_alt_off"
                onClick={() => {
                  setStatus("all");
                  setRole("");
                  setSearch("");
                }}
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </div>

        <div className="px-4 py-4 sm:px-6">
          {filtered.length === 0 ? (
            <EmptyState
              icon={agents.length === 0 ? "group_add" : "search_off"}
              title={agents.length === 0 ? "Aucun agent" : "Aucun agent trouvé"}
              text={
                agents.length === 0
                  ? "Créez le premier agent administratif avec le bouton « Nouvel agent »."
                  : "Modifiez la recherche, le rôle ou le statut pour retrouver un agent."
              }
              action={
                hasFilters ? (
                  <Button
                    variant="outline"
                    size="sm"
                    icon="filter_alt_off"
                    onClick={() => {
                      setStatus("all");
                      setRole("");
                      setSearch("");
                    }}
                  >
                    Réinitialiser les filtres
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table
              stagger
              caption="Agents administratifs Classora"
              rows={filtered}
              rowKey={(r) => r.id}
              columns={[
                {
                  key: "name",
                  header: "Agent",
                  render: (r: AdminAgent) => (
                    <div className="flex min-w-0 items-center gap-3">
                      <EntityAvatar name={`${r.firstName} ${r.lastName}`} active={r.status === "ACTIF"} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">
                          {r.firstName} {r.lastName}
                        </p>
                        <p className="truncate text-xs text-neutral-500">{r.email}</p>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "matricule",
                  header: "Matricule",
                  render: (r: AdminAgent) => <MonoChip>{r.matricule}</MonoChip>,
                },
                {
                  key: "role",
                  header: "Rôle",
                  render: (r: AdminAgent) => <Badge tone={ROLE_TONES[r.role]}>{ROLE_LABELS[r.role]}</Badge>,
                },
                {
                  key: "status",
                  header: "Statut",
                  align: "center",
                  render: (r: AdminAgent) => (
                    <Badge tone={STATUS_TONES[r.status]}>
                      <StatusDot tone={r.status === "ACTIF" ? "success" : r.status === "EN_ATTENTE" ? "warning" : "neutral"} />
                      {STATUS_LABELS[r.status]}
                    </Badge>
                  ),
                },
                {
                  key: "created",
                  header: "Créé le",
                  align: "right",
                  className: "hidden lg:table-cell",
                  render: (r: AdminAgent) => <span className="whitespace-nowrap text-xs text-neutral-500">{formatDate(r.createdAt)}</span>,
                },
              ]}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
