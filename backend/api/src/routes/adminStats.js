/**
 * Statistiques transversales : calculées côté serveur, jamais de téléchargement
 * de toutes les données dans le navigateur. Réservée aux agents admin/superadmin.
 */
import { requireAdminRole, serviceClient } from "../lib/authAdmin.js";
import { ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rateLimit.js";

// Handler principal : GET /admin/stats — statistiques transversales de la plateforme.
export default route(async (req, res) => {
  if (req.method !== "GET") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    const admin = await requireAdminRole(svc, req, res);
    if (!admin) return;
    const { caller } = admin;

    await enforceRateLimit(svc, `admin-stats:${caller.id}`, 30, 300);

    // Nombre total d'écoles.
    const { count: totalSchools } = await svc.from("schools").select("*", { count: "exact", head: true });

    // Écoles réellement actives : inscriptions ouvertes ET abonnement valide
    // — même définition que le statut ACTIF/INACTIF de la RPC
    // admin_school_stats (l'ancien comptage ignorait la suspension admin).
    // `.limit(5000)` explicite : sans limite, PostgREST tronque à 1000 lignes
    // et les compteurs (actives, MRR, expirations) deviennent faux sans signal.
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const { data: schoolRows } = await svc.from("schools").select("id, registration_open").limit(5000);
    const { data: subRows } = await svc.from("subscriptions").select("school_id, plan_id, ends_at").limit(5000);
    const subEndsBySchool = new Map((subRows ?? []).map((r) => [r.school_id, r.ends_at]));
    const activeSchools = (schoolRows ?? []).filter(
      (s) => s.registration_open && (subEndsBySchool.get(s.id) ?? "") >= today,
    ).length;

    // Abonnements et revenus réels : formules, échéances, encaissements du mois.
    const [{ data: planRows }, { data: pendingRequests }, { data: monthEvents }] = await Promise.all([
      svc.from("plans").select("id, monthly_price"),
      svc.from("subscription_requests").select("amount, status").eq("status", "EN_ATTENTE"),
      svc.from("subscription_events").select("amount_paid, created_at").gte("created_at", monthStart),
    ]);
    const planPriceById = new Map((planRows ?? []).map((p) => [p.id, Number(p.monthly_price ?? 0)]));
    const activeSubs = (subRows ?? []).filter((s) => s.ends_at && s.ends_at >= today);
    const expiringSoon = activeSubs.filter((s) => {
      const left = Math.round((Date.parse(`${s.ends_at}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      return Number.isFinite(left) && left <= 30;
    }).length;
    const expiredSubs = (subRows ?? []).filter((s) => s.ends_at && s.ends_at < today).length;
    const subscriptions = {
      active: activeSubs.length,
      expiringSoon,
      expired: expiredSubs,
      none: Math.max(0, (schoolRows ?? []).length - (subRows ?? []).length),
      pendingRequests: (pendingRequests ?? []).length,
      pendingAmount: (pendingRequests ?? []).reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
      mrr: activeSubs.reduce((sum, s) => sum + (planPriceById.get(s.plan_id) ?? 0), 0),
      revenueThisMonth: (monthEvents ?? []).reduce((sum, e) => sum + Number(e.amount_paid ?? 0), 0),
    };

    // Nombre total d'élèves (toutes écoles confondues).
    const { count: totalStudents } = await svc.from("students").select("*", { count: "exact", head: true });

    // Nombre total de classes.
    const { count: totalClasses } = await svc.from("class_rooms").select("*", { count: "exact", head: true });

    // Nombre total de profils par rôle (agents scolaires).
    const { count: totalDirectors } = await svc.from("profiles").select("*", { count: "exact", head: true }).eq("role", "directeur");
    const { count: totalTeachers } = await svc.from("profiles").select("*", { count: "exact", head: true }).in("role", ["professeur", "instituteur"]);
    const { count: totalParents } = await svc.from("profiles").select("*", { count: "exact", head: true }).eq("role", "parent");

    // Statistiques par établissement (top 10 par effectif).
    const { data: schoolStats, error: statsError } = await svc.rpc("admin_school_stats");
    if (statsError) throw new Error("Impossible de charger les statistiques par établissement.");

    // Activités récentes (audit_log des actions administratives).
    const { data: recentActivity, error: activityError } = await svc
      .from("audit_log")
      .select("action, entity, created_at, school_id, actor_role")
      .order("created_at", { ascending: false })
      .limit(20);

    if (activityError) throw new Error("Impossible de charger l'activité récente.");

    return ok(res, {
      generatedAt: new Date().toISOString(),
      schools: {
        total: totalSchools ?? 0,
        active: activeSchools ?? 0,
        suspended: (totalSchools ?? 0) - (activeSchools ?? 0),
      },
      people: {
        totalStudents: totalStudents ?? 0,
        totalClasses: totalClasses ?? 0,
        totalDirectors: totalDirectors ?? 0,
        totalTeachers: totalTeachers ?? 0,
        totalParents: totalParents ?? 0,
      },
      subscriptions,
      bySchool: (schoolStats ?? []).map((s) => ({
        schoolId: s.school_id,
        schoolName: s.school_name,
        matricule: s.matricule ?? "",
        studentCount: Number(s.student_count ?? 0),
        classCount: Number(s.class_count ?? 0),
        teacherCount: Number(s.teacher_count ?? 0),
        status: s.subscription_status ?? "INACTIF",
      })),
      recentActivity: (recentActivity ?? []).map((a) => ({
        action: a.action,
        entity: a.entity,
        createdAt: a.created_at,
        schoolId: a.school_id,
        actorRole: a.actor_role,
      })),
    });
  } catch (e) {
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("admin-stats", e);
    return serverError(res);
  }
});