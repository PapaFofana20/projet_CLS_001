// Tableau de bord de supervision de la plateforme côté admin.
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AsyncView } from "@/components/ui/AsyncView";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Link } from "react-router-dom";
import { LinkButton } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { useAsync } from "@/hooks/useAsync";
import { getAdminOverviewStats } from "@/services/admin";
import type { AdminOverviewStats } from "@/types";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";
import { cn } from "@/utils/cn";
import { useAdminAuth } from "@/context/AdminAuthContext";
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

// État d'abonnement d'une école → libellé et ton du badge.
const SUB_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  ACTIF: { label: "Actif", tone: "success" },
  EXPIRE: { label: "Expiré", tone: "warning" },
  AUCUN: { label: "Sans abonnement", tone: "neutral" },
  INACTIF: { label: "Inactif", tone: "danger" },
};

// Composant principal de la page.
export default function AdminDashboardPage() {
  const state = useAsync(() => getAdminOverviewStats(), []);
  return (
    <>
      <PageHeader
        title="Tableau de bord administratif"
        subtitle="Supervision de la plateforme Classora"
        actions={
          <LinkButton to="/admin/ecoles" icon="school">
            Voir les établissements
          </LinkButton>
        }
      />
      <AdminGreetingSection />
      <AsyncView state={state}>{(s) => <Content s={s} />}</AsyncView>
    </>
  );
}

function Content({ s }: { s: AdminOverviewStats }) {
  // Repli si l'API déployée est antérieure à l'ajout du bloc `subscriptions`.
  const subs = s.subscriptions ?? {
    active: 0,
    expiringSoon: 0,
    expired: 0,
    none: s.schools.total,
    pendingRequests: 0,
    pendingAmount: 0,
    mrr: 0,
    revenueThisMonth: 0,
  };
  // Activité des 24 dernières heures seulement.
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;
  const recent = s.recentActivity.filter((a) => new Date(a.createdAt).getTime() > cutoff);
  const activePct = s.schools.total > 0 ? Math.round((s.schools.active / s.schools.total) * 100) : 0;
  const suspendedPct = s.schools.total > 0 ? 100 - activePct : 0;

  return (
    <div className="space-y-4">
      {/* Bandeau de synthèse : réseau + effectifs */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <HeroCard
          eyebrow="Plateforme Classora"
          icon="school"
          value={formatNumber(s.schools.total)}
          label={`établissement${s.schools.total > 1 ? "s" : ""} enregistré${s.schools.total > 1 ? "s" : ""} sur le réseau`}
          footnote={`Données au ${formatDate(s.generatedAt)}`}
        >
          <HeroBar
            segments={[
              { pct: activePct, className: "bg-lime" },
              { pct: suspendedPct, className: "bg-red-300/80" },
            ]}
          />
          <HeroLegend
            items={[
              { dot: "bg-lime", label: `${formatNumber(s.schools.active)} actif${s.schools.active > 1 ? "s" : ""}` },
              { dot: "bg-red-300", label: `${formatNumber(s.schools.suspended)} suspendu${s.schools.suspended > 1 ? "s" : ""}` },
            ]}
            trailing={
              <>
                <Icon name="trending_up" className="text-[14px]" />
                {activePct} % opérationnels
              </>
            }
          />
        </HeroCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <KpiTile tone="sky" icon="groups" label="Élèves inscrits" value={formatNumber(s.people.totalStudents)} note="Toutes écoles confondues" />
          <KpiTile tone="amber" icon="meeting_room" label="Classes" value={formatNumber(s.people.totalClasses)} note="Établissements actifs" />
          <KpiTile tone="lime" icon="badge" label="Enseignants" value={formatNumber(s.people.totalTeachers)} note="Professeurs et instituteurs" />
          <KpiTile
            tone={subs.expiringSoon > 0 ? "red" : "violet"}
            icon="workspace_premium"
            label="Abonnements actifs"
            value={formatNumber(subs.active)}
            note={`${subs.expiringSoon} à renouveler · ${subs.expired} expiré(s)`}
          />
        </div>
      </div>

      {/* Accès rapides */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink to="/admin/ecoles" icon="school" label="Établissements" value={`${formatNumber(s.schools.total)} écoles`} note="Voir la répartition" tone="forest" />
        <QuickLink to="/admin/abonnements" icon="workspace_premium" label="Abonnements" value={`${formatNumber(subs.active)} actifs`} note="Formules et échéances" tone="lime" />
        <QuickLink to="/admin/agents" icon="verified_user" label="Agents" value="Administration" note="Gérer les accès" tone="white" />
        <QuickLink
          to="/admin/ecoles?status=SUSPENDUE"
          icon="warning"
          label="Alertes"
          value={`${formatNumber(s.schools.suspended)} inactive${s.schools.suspended > 1 ? "s" : ""}`}
          note="Vérifier les écoles"
          tone="mist"
        />
      </div>

      {/* Répartition et activité */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Card padded={false} className="overflow-hidden">
          <div className="px-4 pt-5 sm:px-6">
            <PanelHeading
              icon="domain"
              title="Répartition par établissement"
              subtitle="Élèves, classes et enseignants par école"
              action={<Badge tone="neutral">{s.bySchool.length} école(s)</Badge>}
            />
          </div>
          <div className="mt-4 max-h-[540px] overflow-auto px-4 pb-4 sm:px-6">
            {s.bySchool.length === 0 ? (
              <p className="py-10 text-center text-sm text-neutral-500">Aucun établissement enregistré pour le moment.</p>
            ) : (
              <Table
                stagger
                columns={[
                  {
                    key: "name",
                    header: "Établissement",
                    render: (r: AdminOverviewStats["bySchool"][number]) => {
                      const status = SUB_STATUS[r.status] ?? SUB_STATUS.AUCUN;
                      return (
                        <div className="flex min-w-0 items-center gap-3">
                          <EntityAvatar name={r.schoolName} active={r.status === "ACTIF"} />
                          <div className="min-w-0">
                            <Link
                              to={`/admin/ecoles/${r.schoolId}`}
                              className="block truncate font-semibold text-ink underline-offset-4 hover:text-forest hover:underline"
                            >
                              {r.schoolName}
                            </Link>
                            <div className="mt-1 flex items-center gap-2">
                              <MonoChip>{r.matricule || "—"}</MonoChip>
                              <Badge tone={status.tone} className="px-2 py-0.5 text-[10px]">
                                <StatusDot tone={status.tone === "success" ? "success" : status.tone === "danger" ? "danger" : status.tone === "warning" ? "warning" : "neutral"} />
                                {status.label}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      );
                    },
                  },
                  { key: "students", header: "Élèves", align: "right", render: (r: AdminOverviewStats["bySchool"][number]) => <span className="tabular-nums">{formatNumber(r.studentCount)}</span> },
                  { key: "classes", header: "Classes", align: "right", className: "hidden sm:table-cell", render: (r: AdminOverviewStats["bySchool"][number]) => <span className="tabular-nums">{formatNumber(r.classCount)}</span> },
                  { key: "teachers", header: "Enseignants", align: "right", className: "hidden md:table-cell", render: (r: AdminOverviewStats["bySchool"][number]) => <span className="tabular-nums">{formatNumber(r.teacherCount)}</span> },
                ]}
                rows={s.bySchool}
                rowKey={(r: AdminOverviewStats["bySchool"][number]) => r.schoolId}
                caption="Statistiques par établissement scolaire"
              />
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card padded={false} className="overflow-hidden">
            <div className="px-4 pt-5 sm:px-5">
              <PanelHeading
                icon="history"
                title="Activité récente"
                subtitle="Dernières actions sur 24 h"
                action={<Badge tone={recent.length > 0 ? "lime" : "neutral"}>{recent.length}</Badge>}
              />
            </div>
            <div className="mt-4 max-h-[300px] overflow-y-auto px-4 pb-5 sm:px-5">
              {recent.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-mist/60 px-4 py-8 text-center">
                  <span className="grid size-11 place-items-center rounded-full bg-white text-forest shadow-card">
                    <Icon name="history" className="text-[22px]" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-ink">Aucune activité récente</p>
                  <p className="mt-1 text-xs text-neutral-500">Les actions de la console apparaîtront ici.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {recent.map((a, i) => (
                    <li key={`${a.createdAt}-${i}`} className="flex items-start gap-3 rounded-xl px-2 py-1.5 transition hover:bg-mist/70">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-lime ring-4 ring-lime-soft" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold capitalize text-ink">{a.action?.replace(/_/g, " ") ?? "—"}</p>
                        <p className="mt-0.5 text-[11px] text-neutral-500">
                          {formatDate(a.createdAt)} · {a.entity} · {a.actorName ?? a.actorRole ?? "—"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="px-4 pt-5 sm:px-5">
              <PanelHeading icon="notifications_active" title="Alertes" subtitle="Points à surveiller" />
            </div>
            <div className="mt-4 space-y-2 px-4 pb-5 sm:px-5">
              {s.schools.suspended > 0 && (
                <Link to="/admin/ecoles?status=SUSPENDUE" className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50/70 p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-danger">
                    <Icon name="warning" fill className="text-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-900">{s.schools.suspended} établissement(s) inactif(s)</p>
                    <p className="text-xs text-neutral-600">Abonnement expiré ou absent, ou inscriptions fermées.</p>
                  </div>
                </Link>
              )}
              {s.people.totalStudents === 0 && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-amber-700">
                    <Icon name="info" fill className="text-[18px]" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Aucun élève recensé</p>
                    <p className="text-xs text-neutral-600">Aucun élève actif sur la plateforme.</p>
                  </div>
                </div>
              )}
              {subs.pendingRequests > 0 && (
                <Link to="/admin/abonnements" className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-amber-700">
                    <Icon name="assignment" fill className="text-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-900">{subs.pendingRequests} demande(s) d'abonnement</p>
                    <p className="text-xs text-neutral-600">{formatCurrency(subs.pendingAmount)} à encaisser · cliquez pour traiter.</p>
                  </div>
                </Link>
              )}
              {subs.expiringSoon > 0 && (
                <Link to="/admin/abonnements" className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-amber-700">
                    <Icon name="schedule" fill className="text-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-900">{subs.expiringSoon} échéance(s) sous 30 jours</p>
                    <p className="text-xs text-neutral-600">Anticipez les renouvellements pour éviter les suspensions.</p>
                  </div>
                </Link>
              )}
              {s.schools.suspended === 0 && s.people.totalStudents > 0 && subs.pendingRequests === 0 && subs.expiringSoon === 0 && (
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-emerald-600">
                    <Icon name="check_circle" fill className="text-[18px]" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">Tout va bien</p>
                    <p className="text-xs text-neutral-600">Aucune alerte critique.</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Revenus réels des abonnements */}
      <div className="relative overflow-hidden rounded-3xl border border-lime-200 bg-lime-soft p-5 shadow-card sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/40 blur-2xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-forest/60">Revenus réels des abonnements</p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums text-forest sm:text-4xl">{formatCurrency(subs.revenueThisMonth)}</p>
            <p className="mt-1 text-sm text-forest/70">encaissés ce mois · journal des activations et renouvellements</p>
          </div>
          <LinkButton to="/admin/finances" variant="dark" icon="account_balance_wallet">
            Voir les finances
          </LinkButton>
        </div>
        <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/80 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">MRR</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-forest">{formatCurrency(subs.mrr)}</p>
            <p className="text-[11px] text-neutral-500">Abonnements actifs</p>
          </div>
          <div className="rounded-2xl bg-white/80 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">ARR projeté</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-forest">{formatCurrency(subs.mrr * 12)}</p>
            <p className="text-[11px] text-neutral-500">Projection sur 12 mois</p>
          </div>
          <div className="rounded-2xl bg-white/80 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">À encaisser</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums text-forest">{formatCurrency(subs.pendingAmount)}</p>
            <p className="text-[11px] text-neutral-500">{subs.pendingRequests} demande(s) en attente</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Section de bienvenue pour la console admin : salutation selon l'heure
// et nom de l'agent connecté (n'utilise pas l'auth scolaire).
function AdminGreetingSection() {
  const { agent } = useAdminAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const hour = now.getHours();
  const greeting = hour >= 18 || hour < 5 ? "Bonsoir" : "Bonjour";
  const fullName = `${agent?.firstName ?? ""} ${agent?.lastName ?? ""}`.trim() || "bienvenue";

  return (
    <section aria-label="Bienvenue" className="relative mb-6 overflow-hidden rounded-3xl bg-forest text-white shadow-card">
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-lime/20 blur-3xl" />
      <div className="relative flex flex-wrap items-start gap-5 p-5 sm:p-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-lime">
            {agent?.role ?? "agent"}
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {greeting}, <span className="text-lime">{fullName}</span>
          </h2>
          <p className="mt-1.5 flex items-center gap-x-2 text-sm text-white/80">
            <Icon name="calendar_month" className="text-[18px] text-lime" />
            <span className="text-sm">
              {new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const QUICK_TONES = {
  forest: { box: "bg-forest text-white", chip: "bg-white/10 text-lime", label: "text-white/60", note: "text-lime" },
  lime: { box: "bg-lime text-forest", chip: "bg-forest/10 text-forest", label: "text-forest/70", note: "text-forest" },
  white: { box: "bg-white text-ink", chip: "bg-lime-soft text-forest", label: "text-neutral-500", note: "text-forest" },
  mist: { box: "bg-mist text-ink", chip: "bg-white text-forest", label: "text-neutral-500", note: "text-forest" },
} as const;

function QuickLink({
  to,
  icon,
  label,
  value,
  note,
  tone,
}: {
  to: string;
  icon: string;
  label: string;
  value: string;
  note: string;
  tone: keyof typeof QUICK_TONES;
}) {
  const palette = QUICK_TONES[tone];
  return (
    <Link
      to={to}
      className={cn(
        "group relative overflow-hidden rounded-2xl p-4 shadow-card transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-soft",
        palette.box,
      )}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 size-20 rounded-full bg-white/10 blur-xl" aria-hidden="true" />
      <div className="flex items-center gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", palette.chip)}>
          <Icon name={icon} fill className="text-[22px]" />
        </span>
        <div className="min-w-0">
          <p className={cn("text-[11px] font-bold uppercase tracking-wide", palette.label)}>{label}</p>
          <p className="truncate text-base font-extrabold">{value}</p>
        </div>
      </div>
      <p className={cn("mt-3 flex items-center gap-1.5 text-xs font-semibold", palette.note)}>
        <Icon name="arrow_forward" className="text-[14px]" /> {note}
      </p>
    </Link>
  );
}
