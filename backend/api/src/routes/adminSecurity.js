/**
 * Supervision de la sécurité : activité de connexion des agents, tentatives
 * refusées, actions sensibles et limites de débit réellement atteintes.
 * Uniquement des faits observés dans audit_log / rate_limits / admin_agents.
 */
import { requireAdminRole, serviceClient } from "../lib/authAdmin.js";
import { ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rateLimit.js";

const BLOCKED_ACTIONS = [
  "admin_login_blocked",
  "admin_login_blocked_school_account",
  "admin_login_failed",
  "login_blocked_admin_agent",
  "login_blocked_desactive",
  "login_blocked_en_attente",
  "login_blocked_unknown_status",
];

const SENSITIVE_ACTIONS = [
  "admin_school_deleted",
  "admin_school_status_changed",
  "admin_school_updated",
  "admin_agent_created",
  "admin_agent_updated",
  "subscription_activated_manually",
  "subscription_request_cancelled",
  "platform_settings_updated",
  "audit_log_purged",
];

/** Clé jour (AAAA-MM-JJ) d'une date ISO, pour regrouper les événements par jour. */
function dayKey(iso) {
  return String(iso).slice(0, 10);
}

// Handler principal : GET /admin/security — supervision de l'activité de connexion des agents.
export default route(async (req, res) => {
  if (req.method !== "GET") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    const admin = await requireAdminRole(svc, req, res, ["admin", "superadmin"]);
    if (!admin) return;
    const { caller } = admin;

    await enforceRateLimit(svc, `admin-security:${caller.id}`, 30, 300);

    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const since15min = new Date(Date.now() - 15 * 60_000).toISOString();
    const since24h = new Date(Date.now() - 86_400_000).toISOString();

    const [
      { data: agents, error: agentsError },
      { data: loginRows, error: loginError },
      { data: sensitiveRows, error: sensitiveError },
      { data: rateRows, error: rateError },
      { count: activeRateLimits },
      { count: auditEvents24h },
    ] = await Promise.all([
      svc.from("admin_agents").select("id, auth_user_id, matricule, role, status, first_name, last_name, email, created_at").order("created_at"),
      svc
        .from("audit_log")
        .select("id, actor_id, actor_role, action, created_at, payload, entity, entity_id")
        .in("action", ["admin_login", ...BLOCKED_ACTIONS])
        .gte("created_at", since30)
        .order("created_at", { ascending: false })
        .limit(3000),
      svc
        .from("audit_log")
        .select("id, school_id, actor_id, actor_role, action, entity, entity_id, payload, created_at")
        .in("action", SENSITIVE_ACTIONS)
        .gte("created_at", since30)
        .order("created_at", { ascending: false })
        .limit(30),
      svc
        .from("rate_limits")
        .select("key, count, window_start")
        .gte("window_start", since15min)
        .order("count", { ascending: false })
        .limit(15),
      svc
        .from("rate_limits")
        .select("*", { count: "exact", head: true })
        .gte("window_start", since15min),
      svc.from("audit_log").select("*", { count: "exact", head: true }).gte("created_at", since24h),
    ]);

    if (agentsError) throw new Error("Impossible de charger les agents.");
    if (loginError) throw new Error("Impossible de charger l'activité de connexion.");
    if (sensitiveError) throw new Error("Impossible de charger les actions sensibles.");
    if (rateError) throw new Error("Impossible de charger les limites de débit.");

    const allAgents = agents ?? [];
    const logins = (loginRows ?? []).filter((r) => r.action === "admin_login");
    const blocked = (loginRows ?? []).filter((r) => r.action !== "admin_login");

    const lastLoginByActor = new Map();
    const loginCountByActor = new Map();
    const blockedByActor = new Map();
    for (const row of logins) {
      if (!row.actor_id) continue;
      if (!lastLoginByActor.has(row.actor_id)) lastLoginByActor.set(row.actor_id, row.created_at);
      loginCountByActor.set(row.actor_id, (loginCountByActor.get(row.actor_id) ?? 0) + 1);
    }
    for (const row of blocked) {
      if (!row.actor_id) continue;
      blockedByActor.set(row.actor_id, (blockedByActor.get(row.actor_id) ?? 0) + 1);
    }

    const days = 14; // 14 derniers jours
    const daily = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date(Date.now() - i * 86_400_000);
      const key = date.toISOString().slice(0, 10);
      const label = date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
      daily.push({
        key,
        label,
        logins: logins.filter((r) => dayKey(r.created_at) === key).length,
        blocked: blocked.filter((r) => dayKey(r.created_at) === key).length,
      });
    }

    const loginAttempts = logins.length + blocked.length;
    const summary = {
      totalAgents: allAgents.length,
      activeAgents: allAgents.filter((a) => a.status === "ACTIF").length,
      disabledAgents: allAgents.filter((a) => a.status === "DESACTIVE").length,
      pendingAgents: allAgents.filter((a) => a.status === "EN_ATTENTE").length,
      logins30: logins.length,
      blocked30: blocked.length,
      blockedRate: loginAttempts ? Math.round((blocked.length / loginAttempts) * 1000) / 10 : 0,
      lastLoginAt: logins[0]?.created_at ?? null,
      activeRateLimits: activeRateLimits ?? 0,
      auditEvents24h: auditEvents24h ?? 0,
    };

    const agentName = new Map(allAgents.map((a) => [a.auth_user_id, `${a.first_name} ${a.last_name}`.trim()]));

    return ok(res, {
      generatedAt: new Date().toISOString(),
      summary,
      agents: allAgents.map((a) => ({
        id: a.id,
        matricule: a.matricule,
        role: a.role,
        status: a.status,
        firstName: a.first_name,
        lastName: a.last_name,
        email: caller.role === "superadmin" ? a.email : undefined,
        createdAt: a.created_at,
        lastLoginAt: lastLoginByActor.get(a.auth_user_id) ?? null,
        loginCount30: loginCountByActor.get(a.auth_user_id) ?? 0,
        blockedCount30: blockedByActor.get(a.auth_user_id) ?? 0,
      })),
      daily,
      alerts: blocked.slice(0, 20).map((r) => ({
        id: r.id,
        action: r.action,
        actorRole: r.actor_role,
        actorName: r.actor_id ? agentName.get(r.actor_id) ?? null : null,
        createdAt: r.created_at,
        payload: caller.role === "superadmin" ? (r.payload ?? {}) : {},
      })),
      sensitiveActions: (sensitiveRows ?? []).map((r) => ({
        id: r.id,
        action: r.action,
        actorRole: r.actor_role,
        actorName: r.actor_id ? agentName.get(r.actor_id) ?? null : null,
        entity: r.entity,
        entityId: r.entity_id,
        schoolId: r.school_id,
        createdAt: r.created_at,
        payload: caller.role === "superadmin" ? (r.payload ?? {}) : {},
      })),
      rateLimits: (rateRows ?? []).map((r) => ({
        key: r.key,
        count: Number(r.count ?? 0),
        windowStart: r.window_start,
      })),
    });
  } catch (e) {
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("admin-security", e);
    return serverError(res);
  }
});
