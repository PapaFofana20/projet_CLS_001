// Tableau de bord de supervision de la plateforme côté admin.
import { PageHeader } from "@/components/ui/PageHeader";
import { AsyncView } from "@/components/ui/AsyncView";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Link } from "react-router-dom";
import { LinkButton } from "@/components/ui/Button";
import { useAsync } from "@/hooks/useAsync";
import { getAdminOverviewStats } from "@/services/admin";
import type { AdminOverviewStats } from "@/types";
import { formatCurrency, formatDate } from "@/utils/format";
import { cn } from "@/utils/cn";
import { Table } from "@/components/ui/Table";

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
  const subTotal = subs.active + subs.expired + subs.none;

  // Activité des 24 dernières heures seulement.
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;
  const recent = s.recentActivity.filter((a) => new Date(a.createdAt).getTime() > cutoff);
  return (
    <div className="space-y-4">
      {/* Bandeau d'actions rapides — autorité admin */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/admin/ecoles" className="group relative overflow-hidden rounded-3xl bg-forest p-5 text-white shadow-soft transition-transform hover:-translate-y-0.5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white/10"><Icon name="school" fill className="text-[22px] text-lime" /></span>
            <div><p className="text-xs font-bold uppercase tracking-wide text-white/60">Établissements</p><p className="text-lg font-extrabold">{s.schools.total} écoles</p></div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-lime"><Icon name="arrow_forward" className="text-[14px]" /> Voir la répartition</div>
        </Link>
        <Link to="/admin/agents" className="group relative overflow-hidden rounded-3xl bg-lime p-5 text-forest shadow-soft transition-transform hover:-translate-y-0.5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-forest/10"><Icon name="verified_user" fill className="text-[22px] text-forest" /></span>
            <div><p className="text-xs font-bold uppercase tracking-wide text-forest/70">Agents</p><p className="text-lg font-extrabold">Administration</p></div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-forest"><Icon name="arrow_forward" className="text-[14px]" /> Gérer les accès</div>
        </Link>
        <Link to="/admin/ecoles" className="group relative overflow-hidden rounded-3xl bg-mist p-5 text-ink shadow-soft transition-transform hover:-translate-y-0.5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-forest/10"><Icon name="warning" fill className="text-[22px] text-danger" /></span>
            <div><p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Alertes</p><p className="text-lg font-extrabold">{s.schools.suspended} inactive{Number(s.schools.suspended) > 1 ? 's' : ''}</p></div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-forest"><Icon name="arrow_forward" className="text-[14px]" /> Vérifier</div>
        </Link>
        <Card className="rounded-3xl bg-gradient-to-br from-forest/10 to-lime/20 p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-forest text-lime"><Icon name="security" fill className="text-[22px]" /></span>
            <div><p className="text-xs font-bold uppercase tracking-wide text-forest-500">Intégrité</p><p className="text-lg font-extrabold text-ink">Plateforme active</p></div>
          </div>
          <div className="mt-2 text-xs font-medium text-neutral-600">RLS actives · JWT vérifié · Audit journalisé</div>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard dark icon="school" label="Écoles totales" value={String(s.schools.total)} badge={{ text: `${s.schools.active} actives`, tone: "up" }} note={`${s.schools.suspended} inactive${s.schools.suspended > 1 ? "s" : ""}`} />
        <StatCard icon="groups" label="Élèves inscrits" value={String(s.people.totalStudents)} note="toutes écoles confondues" />
        <StatCard icon="meeting_room" label="Classes" value={String(s.people.totalClasses)} note="établissements actifs" />
        <StatCard icon="badge" label="Enseignants" value={String(s.people.totalTeachers)} note="professeurs et instituteurs" />
        <StatCard icon="workspace_premium" label="Abonnements payants actifs" value={String(subs.active)} badge={{ text: `${subs.expiringSoon} à renouveler`, tone: subs.expiringSoon > 0 ? "down" : "neutral" }} note={`${subs.expired} expiré(s) · ${subs.none} sans abonnement`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-3xl shadow-soft border border-neutral-100">
          <CardHeader
            title="Répartition par établissement"
            subtitle="Élèves, classes et enseignants par école"
            action={<Link to="/admin/ecoles" className="text-sm font-medium text-forest">Voir le détail →</Link>}
          />
          <div className="overflow-x-auto">
            <Table
              columns={[
                { key: "name", header: "Établissement", render: (r: { schoolName: string }) => <div className="font-medium">{r.schoolName}</div> },
                { key: "matricule", header: "Matricule", render: (r: { matricule: string }) => <span className="text-xs text-neutral-500 tabular-nums">{r.matricule}</span> },
                { key: "students", header: "Élèves", align: "right", render: (r: { studentCount: number }) => <span className="tabular-nums">{r.studentCount}</span> },
                { key: "classes", header: "Classes", align: "right", render: (r: { classCount: number }) => <span className="tabular-nums">{r.classCount}</span> },
                { key: "teachers", header: "Enseignants", align: "right", render: (r: { teacherCount: number }) => <span className="tabular-nums">{r.teacherCount}</span> },
                {
                  key: "status",
                  header: "Statut",
                  align: "center",
                  render: (r: { status: string }) => (
                    <Badge tone={r.status === "ACTIF" ? "success" : "danger"}>
                      {r.status === "ACTIF" ? "Actif" : "Inactif"}
                    </Badge>
                  ),
                },
              ]}
              rows={s.bySchool as unknown as { schoolName: string; matricule: string; studentCount: number; classCount: number; teacherCount: number; status: string }[]}
              rowKey={(r: { schoolName: string; matricule: string; studentCount: number; classCount: number; teacherCount: number; status: string }) => r.schoolName}
              caption="Statistiques par établissement scolaire"
            />
          </div>
        </Card>

        <Card className="rounded-3xl shadow-soft border border-neutral-100">
          <CardHeader title="Activité administrative récente" subtitle="Dernières actions réalisées sur la plateforme" />
          <div className="space-y-3">
            {recent.length === 0 ? (
              <div className="text-center py-8 text-neutral-400 text-sm">
                <Icon name="history" fill className="text-[32px] mb-2 opacity-40" />
                <div>Aucune activité au cours des 24 dernières heures.</div>
              </div>
            ) : (
              <div className="space-y-2">
                {recent.map((a, i) => (
                  <div key={`${a.createdAt}-${i}`} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-lime mt-1" />
                    <div className="min-w-0 flex-1">
                      <p className="text-ink font-medium">{a.action?.replace(/_/g, " ") ?? "—"}</p>
                      <p className="text-xs text-neutral-500">{formatDate(a.createdAt)} · {a.entity} · {a.actorName ?? a.actorRole ?? "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Alertes — conservées en dessous, plein largeur */}
      <div className="mt-6">
        <Card>
          <CardHeader title="Alertes" />
          <div className="space-y-3">
            {s.schools.suspended > 0 && (
              <div className="flex items-start gap-3 rounded-xl p-3 bg-red-50">
                <Icon name="warning" fill className="text-[20px] text-danger shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-danger">{s.schools.suspended} établissement(s) inactif(s)</p>
                  <p className="text-xs text-neutral-500">Abonnement expiré ou absent, ou inscriptions fermées.</p>
                </div>
              </div>
            )}
            {s.people.totalStudents === 0 && (
              <div className="flex items-start gap-3 rounded-xl p-3 bg-amber-50">
                <Icon name="info" fill className="text-[20px] text-amber-800 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Aucun élève recensé</p>
                  <p className="text-xs text-neutral-500">Aucun élève actif sur la plateforme.</p>
                </div>
              </div>
            )}
            {subs.pendingRequests > 0 && (
              <Link to="/admin/abonnements" className="flex items-start gap-3 rounded-xl p-3 bg-amber-50">
                <Icon name="assignment" fill className="text-[20px] text-amber-800 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">{subs.pendingRequests} demande(s) d'abonnement</p>
                  <p className="text-xs text-neutral-500">{formatCurrency(subs.pendingAmount)} à encaisser · cliquez pour traiter.</p>
                </div>
              </Link>
            )}
            {subs.expiringSoon > 0 && (
              <Link to="/admin/abonnements" className="flex items-start gap-3 rounded-xl p-3 bg-amber-50">
                <Icon name="schedule" fill className="text-[20px] text-amber-800 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">{subs.expiringSoon} échéance(s) sous 30 jours</p>
                  <p className="text-xs text-neutral-500">Anticipez les renouvellements pour éviter les suspensions.</p>
                </div>
              </Link>
            )}
            {s.schools.suspended === 0 && s.people.totalStudents > 0 && subs.pendingRequests === 0 && subs.expiringSoon === 0 && (
              <div className="flex items-start gap-3 rounded-xl p-3 bg-emerald-50">
                <Icon name="check_circle" fill className="text-[20px] text-emerald-800 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-800">Tout va bien</p>
                  <p className="text-xs text-neutral-500">Aucune alerte critique.</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Section SaaS — Abonnements et revenus réels */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-3xl bg-white shadow-soft">
          <CardHeader
            title="Répartition des abonnements"
            subtitle={`${subs.pendingRequests} demande(s) en attente`}
            action={<Link to="/admin/abonnements" className="text-sm font-medium">Gérer</Link>}
          />
          <div className="space-y-3">
            {[
              { label: "Abonnements actifs", value: subs.active, color: "bg-lime" },
              { label: "Échéance < 30 jours", value: subs.expiringSoon, color: "bg-amber-500" },
              { label: "Abonnements expirés", value: subs.expired, color: "bg-danger" },
              { label: "Écoles sans abonnement", value: subs.none, color: "bg-forest/40" },
            ].map((b) => (
              <div key={b.label}>
                <div className="flex justify-between text-sm font-medium text-ink">
                  <span>{b.label}</span>
                  <span>
                    {b.value} école{b.value > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div className={cn("h-full rounded-full transition-all", b.color)} style={{ width: `${(b.value / (subTotal || 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-3xl bg-gradient-to-br from-ink to-forest text-white shadow-soft">
          <CardHeader title="Revenus réels des abonnements" />
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-white/50">Encaissé ce mois</p>
              <p className="mt-1 text-3xl font-extrabold">{formatCurrency(subs.revenueThisMonth)}</p>
              <p className="text-xs text-white/60">Journal des activations et renouvellements</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wide text-white/50">MRR (abonnements actifs)</p>
              <p className="mt-1 text-xl font-extrabold">{formatCurrency(subs.mrr)}</p>
              <p className="mt-0.5 text-[11px] text-white/60">ARR projeté : {formatCurrency(subs.mrr * 12)}</p>
            </div>
            <Link to="/admin/finances" className="flex items-center gap-2 text-xs font-semibold text-lime">
              <Icon name="arrow_forward" className="text-[14px]" /> Voir les finances détaillées
            </Link>
          </div>
        </Card>

        <Card className="rounded-3xl bg-mist shadow-soft">
          <CardHeader title="Demandes d'abonnement" action={<Badge tone={subs.pendingRequests > 0 ? "warning" : "success"}>{subs.pendingRequests} en attente</Badge>} />
          <div className="space-y-3">
            {[
              { label: "Écoles actives", val: s.schools.active, max: Math.max(s.schools.total, 1), color: "bg-forest" },
              { label: "Abonnements actifs", val: subs.active, max: Math.max(subTotal, 1), color: "bg-lime" },
              { label: "Renouvellements < 30 j", val: subs.expiringSoon, max: Math.max(subs.active, 1), color: "bg-amber-500" },
            ].map((m) => (
              <div key={m.label}>
                <div className="flex justify-between text-xs font-semibold text-neutral-600">
                  <span>{m.label}</span>
                  <span>{m.val}</span>
                </div>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div className={cn("h-full rounded-full", m.color)} style={{ width: `${Math.min((m.val / m.max) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
            <div className="mt-2 rounded-xl bg-forest/5 p-3 text-xs leading-relaxed text-neutral-600">
              <strong>Montants en attente :</strong> {formatCurrency(subs.pendingAmount)}. Les demandes sont traitées depuis
              l'onglet Abonnements après encaissement.
            </div>
            <Link to="/admin/abonnements" className="inline-flex items-center gap-2 text-xs font-semibold text-forest">
              <Icon name="assignment" className="text-[14px]" /> Traiter les demandes
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}