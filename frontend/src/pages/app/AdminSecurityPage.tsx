// Vue de sécurité : accès admin, tentatives bloquées et actions sensibles.
import { PageHeader } from "@/components/ui/PageHeader";
import { AsyncView } from "@/components/ui/AsyncView";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAsync } from "@/hooks/useAsync";
import { getAdminSecurity } from "@/services/admin";
import type { AdminSecurityData } from "@/types";
import { actionLabel, roleLabel } from "@/features/admin/labels";
import { LoginActivityChart } from "@/features/admin/charts";
import { formatDate, formatDateTime, formatNumber } from "@/utils/format";
import {
  EntityAvatar,
  HeroBar,
  HeroCard,
  HeroLegend,
  KpiTile,
  MonoChip,
  PanelHeading,
  StatusDot,
} from "@/features/admin/adminUi";

function roleTone(role: string): BadgeTone {
  if (role === "superadmin") return "dark";
  if (role === "admin") return "info";
  return "neutral";
}

function statusTone(status: "ACTIF" | "EN_ATTENTE" | "DESACTIVE"): "success" | "warning" | "neutral" {
  return status === "ACTIF" ? "success" : status === "EN_ATTENTE" ? "warning" : "neutral";
}

function alertReason(payload: Record<string, unknown>): string {
  const reason = payload.reason ?? payload.message ?? payload.detail;
  return typeof reason === "string" && reason.trim() ? reason : "Tentative refusée par le contrôle d'accès.";
}

// Composant principal de la page.
export default function AdminSecurityPage() {
  const state = useAsync(() => getAdminSecurity(), []);

  return (
    <>
      <PageHeader
        title="Sécurité"
        subtitle="Surveillance des accès administratifs, des tentatives bloquées et des actions sensibles"
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton to="/admin/agents" variant="outline" icon="manage_accounts">
              Agents
            </LinkButton>
            <LinkButton to="/admin/supervision/audit" icon="history">
              Journal d'audit
            </LinkButton>
          </div>
        }
      />
      <AsyncView state={state}>{(data) => <Content data={data} />}</AsyncView>
    </>
  );
}

function Content({ data }: { data: AdminSecurityData }) {
  const s = data.summary;
  const recentAlerts = data.alerts.slice(0, 12);
  const activePct = s.totalAgents > 0 ? Math.round((s.activeAgents / s.totalAgents) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Bandeau de synthèse : comptes et posture */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <HeroCard
          eyebrow="Posture de sécurité"
          icon="shield"
          value={formatNumber(s.activeAgents)}
          badge={
            <Badge tone={s.pendingAgents + s.disabledAgents > 0 ? "warning" : "success"}>
              <StatusDot tone={s.pendingAgents + s.disabledAgents > 0 ? "warning" : "success"} />
              {s.blocked30 > 0 ? `${s.blocked30} refus / 30 j` : "Aucun refus / 30 j"}
            </Badge>
          }
          label={`compte(s) administrateur actif(s) sur ${formatNumber(s.totalAgents)} agent(s) enregistré(s)`}
          footnote={`Données au ${formatDate(data.generatedAt)}`}
        >
          <HeroBar
            segments={[
              { pct: (s.activeAgents / Math.max(s.totalAgents, 1)) * 100, className: "bg-lime" },
              { pct: (s.pendingAgents / Math.max(s.totalAgents, 1)) * 100, className: "bg-amber-300/90" },
              { pct: (s.disabledAgents / Math.max(s.totalAgents, 1)) * 100, className: "bg-white/25" },
            ]}
          />
          <HeroLegend
            items={[
              { dot: "bg-lime", label: `${s.activeAgents} actif(s)` },
              { dot: "bg-amber-300", label: `${s.pendingAgents} en attente` },
              { dot: "bg-white/40", label: `${s.disabledAgents} désactivé(s)` },
            ]}
            trailing={
              <>
                <Icon name="verified_user" className="text-[14px]" />
                {activePct} % opérationnels
              </>
            }
          />
        </HeroCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <KpiTile
            tone="sky"
            icon="login"
            label="Connexions (30 j)"
            value={formatNumber(s.logins30)}
            note={s.lastLoginAt ? `Dernière : ${formatDate(s.lastLoginAt)}` : "Aucune connexion enregistrée"}
            valueClassName="text-2xl"
          />
          <KpiTile
            tone={s.blocked30 > 0 ? "red" : "lime"}
            icon="gpp_bad"
            label="Tentatives bloquées"
            value={formatNumber(s.blocked30)}
            note={s.blockedRate > 0 ? `${s.blockedRate} % des connexions · 30 derniers jours` : "Sur les 30 derniers jours"}
          />
          <KpiTile
            tone="amber"
            icon="speed"
            label="Limites de débit"
            value={formatNumber(s.activeRateLimits)}
            note="Fenêtres ouvertes sur 15 minutes"
          />
          <KpiTile
            tone="violet"
            icon="history"
            label="Événements (24 h)"
            value={formatNumber(s.auditEvents24h)}
            note={`${formatNumber(data.sensitiveActions.length)} action(s) sensible(s) sur 30 j`}
          />
        </div>
      </div>

      {/* Activité de connexion et posture détaillée */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <PanelHeading
            icon="insights"
            title="Activité de connexion sur 14 jours"
            subtitle="Connexions réussies et tentatives refusées, relevées dans le journal d'audit."
            action={<Badge tone={s.blocked30 > 0 ? "warning" : "success"}>{s.blocked30} tentative(s) bloquée(s) / 30 j</Badge>}
          />
          <div className="mt-4">
            <LoginActivityChart data={data.daily} />
          </div>
        </Card>

        <Card>
          <PanelHeading icon="verified_user" title="Posture de sécurité" subtitle="Faits observés sur la plateforme." />
          <div className="mt-4 space-y-2.5">
            <PostureRow
              icon="lock"
              label="Authentification des agents"
              value={s.activeAgents > 0 ? `${s.activeAgents} compte(s) actif(s)` : "Aucun compte actif"}
              tone={s.activeAgents > 0 ? "success" : "warning"}
            />
            <PostureRow
              icon="block"
              label="Tentatives refusées suivies"
              value={s.blocked30 > 0 ? `${s.blocked30} sur 30 jours` : "Aucune"}
              tone={s.blocked30 > 0 ? "warning" : "success"}
            />
            <PostureRow
              icon="hourglass_empty"
              label="Agents en attente de validation"
              value={String(s.pendingAgents)}
              tone={s.pendingAgents > 0 ? "warning" : "success"}
            />
            <PostureRow icon="person_off" label="Agents désactivés" value={String(s.disabledAgents)} tone="neutral" />
            <PostureRow
              icon="visibility"
              label="Actions sensibles journalisées"
              value={`${data.sensitiveActions.length} sur 30 jours`}
              tone="success"
            />
          </div>
          <div className="mt-4 rounded-2xl bg-mist p-4 text-xs leading-relaxed text-neutral-600">
            Les tentatives bloquées incluent les échecs de mot de passe, les comptes scolaires utilisés sur la console et les agents
            désactivés ou en attente. Chaque refus est conservé dans <code className="font-semibold text-forest">audit_log</code>.
          </div>
        </Card>
      </div>

      {/* Agents administratifs */}
      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-5 sm:px-6">
          <PanelHeading
            icon="groups"
            title="Agents administratifs"
            subtitle="Dernière connexion et activité de chacun sur 30 jours."
          />
          <LinkButton to="/admin/agents" variant="outline" size="sm" icon="arrow_forward">
            Gérer les accès
          </LinkButton>
        </div>
        <div className="px-4 py-4 sm:px-6">
          {data.agents.length === 0 ? (
            <EmptyState icon="group_off" title="Aucun agent" text="Créez un premier agent depuis la page Agents." />
          ) : (
            <Table
              stagger
              caption="Activité des agents administratifs"
              rows={data.agents}
              rowKey={(agent) => agent.id}
              columns={[
                {
                  key: "agent",
                  header: "Agent",
                  render: (agent) => (
                    <div className="flex min-w-0 items-center gap-3">
                      <EntityAvatar name={`${agent.firstName} ${agent.lastName}`} active={agent.status === "ACTIF"} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">
                          {agent.firstName} {agent.lastName}
                        </p>
                        <p className="truncate text-xs text-neutral-500">{agent.email}</p>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "matricule",
                  header: "Matricule",
                  className: "hidden lg:table-cell",
                  render: (agent) => <MonoChip>{agent.matricule}</MonoChip>,
                },
                {
                  key: "role",
                  header: "Rôle",
                  align: "center",
                  render: (agent) => <Badge tone={roleTone(agent.role)}>{roleLabel(agent.role)}</Badge>,
                },
                {
                  key: "status",
                  header: "Statut",
                  align: "center",
                  render: (agent) => (
                    <Badge tone={statusTone(agent.status)}>
                      <StatusDot tone={statusTone(agent.status)} />
                      {agent.status === "ACTIF" ? "Actif" : agent.status === "EN_ATTENTE" ? "En attente" : "Désactivé"}
                    </Badge>
                  ),
                },
                {
                  key: "last",
                  header: "Dernière connexion",
                  className: "hidden xl:table-cell",
                  render: (agent) => (
                    <span className="whitespace-nowrap text-xs text-neutral-600">
                      {agent.lastLoginAt ? formatDateTime(agent.lastLoginAt) : "Jamais"}
                    </span>
                  ),
                },
                {
                  key: "logins",
                  header: "Connexions 30 j",
                  align: "right",
                  className: "hidden xl:table-cell",
                  render: (agent) => <span className="tabular-nums">{agent.loginCount30}</span>,
                },
                {
                  key: "blocked",
                  header: "Refus 30 j",
                  align: "right",
                  render: (agent) => (
                    <span
                      className={
                        agent.blockedCount30 > 0 ? "font-bold tabular-nums text-danger" : "tabular-nums text-neutral-400"
                      }
                    >
                      {agent.blockedCount30}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </div>
      </Card>

      {/* Refus et limites de débit */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeading
            icon="gpp_bad"
            title="Tentatives d'accès refusées"
            subtitle="Les 20 derniers refus enregistrés."
            action={<Badge tone={recentAlerts.length > 0 ? "danger" : "success"}>{recentAlerts.length}</Badge>}
          />
          {recentAlerts.length === 0 ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-emerald-600">
                <Icon name="check_circle" fill className="text-[20px]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-emerald-900">Aucune tentative refusée</p>
                <p className="text-xs text-neutral-600">Aucun refus sur les 30 derniers jours.</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50/60 p-3 transition hover:border-red-200"
                >
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-white text-danger">
                    <Icon name="gpp_bad" fill className="text-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{actionLabel(alert.action)}</p>
                    <p className="text-xs text-neutral-600">{alertReason(alert.payload)}</p>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      {alert.actorName ?? "Acteur inconnu"} · {roleLabel(alert.actorRole)} · {formatDateTime(alert.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <PanelHeading
            icon="speed"
            title="Limites de débit atteintes"
            subtitle="Fenêtres actives sur les 15 dernières minutes."
            action={<Badge tone={data.rateLimits.length > 0 ? "warning" : "success"}>{data.rateLimits.length}</Badge>}
          />
          {data.rateLimits.length === 0 ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-emerald-600">
                <Icon name="check_circle" fill className="text-[20px]" />
              </span>
              <div>
                <p className="text-sm font-semibold text-emerald-900">Aucune limite atteinte</p>
                <p className="text-xs text-neutral-600">Aucune fenêtre de limitation active actuellement.</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {data.rateLimits.map((limit) => (
                <div key={limit.key} className="flex items-center justify-between gap-3 rounded-2xl bg-mist px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-ink">{limit.key}</p>
                    <p className="text-[11px] text-neutral-500">Fenêtre ouverte le {formatDateTime(limit.windowStart)}</p>
                  </div>
                  <Badge tone={limit.count >= 10 ? "danger" : "warning"}>{limit.count} requête(s)</Badge>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            Les clés correspondent aux compteurs serveur (agent ou adresse IP). Elles expirent automatiquement.
          </p>
        </Card>
      </div>

      {/* Actions sensibles */}
      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-5 sm:px-6">
          <PanelHeading
            icon="admin_panel_settings"
            title="Actions sensibles récentes"
            subtitle="Modifications d'établissements, d'agents, d'abonnements et de paramètres."
          />
          <LinkButton to="/admin/supervision/audit" variant="outline" size="sm" icon="open_in_new">
            Ouvrir le journal
          </LinkButton>
        </div>
        <div className="px-4 py-4 sm:px-6">
          {data.sensitiveActions.length === 0 ? (
            <EmptyState icon="shield" title="Aucune action sensible" text="Les opérations à fort impact apparaîtront ici." />
          ) : (
            <Table
              stagger
              caption="Actions sensibles récentes"
              rows={data.sensitiveActions}
              rowKey={(action) => action.id}
              columns={[
                {
                  key: "date",
                  header: "Date",
                  render: (action) => (
                    <span className="whitespace-nowrap text-xs text-neutral-600">{formatDateTime(action.createdAt)}</span>
                  ),
                },
                {
                  key: "action",
                  header: "Action",
                  render: (action) => (
                    <Badge tone="neutral">
                      <StatusDot tone="neutral" />
                      {actionLabel(action.action)}
                    </Badge>
                  ),
                },
                {
                  key: "actor",
                  header: "Auteur",
                  render: (action) => (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{action.actorName ?? "Système"}</p>
                      <p className="text-xs text-neutral-500">{roleLabel(action.actorRole)}</p>
                    </div>
                  ),
                },
                {
                  key: "entity",
                  header: "Entité",
                  render: (action) => (
                    <div className="min-w-0">
                      <p className="text-sm">{action.entity}</p>
                      <div className="mt-0.5">
                        <MonoChip>{action.entityId ?? "—"}</MonoChip>
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function PostureRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone: "success" | "warning" | "neutral";
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-mist px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-forest">
        <Icon name={icon} className="text-[18px]" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium text-neutral-700">{label}</span>
      <Badge tone={tone}>
        <StatusDot tone={tone} />
        {value}
      </Badge>
    </div>
  );
}
