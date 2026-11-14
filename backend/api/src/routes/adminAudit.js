/**
 * Journal d'audit : consultation paginée et purge contrôlée.
 * Lecture pour tous les agents, purge réservée au superadministrateur.
 */
import { auditAdmin, requireAdminRole, requireSuperAdmin, serviceClient } from "../lib/authAdmin.js";
import { badRequest, ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { readPlatformSettings } from "../lib/platformSettings.js";
import { enforceRateLimit } from "../lib/rateLimit.js";
import { expectObject, ValidationError } from "../lib/validate.js";

const PERIOD_DAYS = new Set([7, 30, 90]);

/** Nettoie le terme de recherche pour éviter les caractères spéciaux PostgREST. */
function sanitizeSearch(value) {
  return String(value ?? "")
    .trim()
    .slice(0, 60)
    .replace(/[,()\\%_]/g, " ");
}

// Handler principal : GET/DELETE /admin/audit — lecture et purge du journal d'audit.
export default route(async (req, res) => {
  const svc = serviceClient();
  try {
    if (req.method === "GET") {
      const admin = await requireAdminRole(svc, req, res, ["admin", "superadmin"]);
      if (!admin) return;
      const { caller } = admin;
      await enforceRateLimit(svc, `admin-audit-read:${caller.id}`, 40, 300);

      const rawPage = parseInt(req.query.page ?? "1", 10);
      const rawPageSize = parseInt(req.query.pageSize ?? "25", 10);
      const page = Number.isInteger(rawPage) ? Math.max(1, rawPage) : 1;
      const pageSize = Number.isInteger(rawPageSize) ? Math.min(100, Math.max(1, rawPageSize)) : 25;
      const search = sanitizeSearch(req.query.search);
      const action = String(req.query.action ?? "").trim().slice(0, 80);
      const rawDays = parseInt(req.query.days ?? "30", 10);
      const days = PERIOD_DAYS.has(rawDays) ? rawDays : 30;

      const since = new Date(Date.now() - days * 86_400_000).toISOString();

      let query = svc
        .from("audit_log")
        .select("id, school_id, actor_id, actor_role, action, entity, entity_id, payload, created_at", {
          count: "exact",
        })
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (action) query = query.eq("action", action);
      if (search) {
        const term = search.replace(/\s+/g, " ");
        query = query.or(`action.ilike.%${term}%,entity.ilike.%${term}%,actor_role.ilike.%${term}%`);
      }

      const { data: rows, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
      if (error) throw new Error("Impossible de charger le journal d'audit.");

      // Échantillon pour la répartition par action (1 000 derniers événements).
      const { data: sample } = await svc
        .from("audit_log")
        .select("action")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      const actionCounts = new Map();
      for (const row of sample ?? []) {
        actionCounts.set(row.action, (actionCounts.get(row.action) ?? 0) + 1);
      }

      const schoolIds = Array.from(new Set((rows ?? []).map((r) => r.school_id).filter(Boolean)));
      const actorIds = Array.from(new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean)));

      const [schoolsRes, adminActorsRes, schoolActorsRes] = await Promise.all([
        schoolIds.length
          ? svc.from("schools").select("id, name, matricule").in("id", schoolIds)
          : Promise.resolve({ data: [] }),
        actorIds.length
          ? svc.from("admin_agents").select("auth_user_id, first_name, last_name, role").in("auth_user_id", actorIds)
          : Promise.resolve({ data: [] }),
        actorIds.length
          ? svc.from("profiles").select("id, first_name, last_name, role").in("id", actorIds)
          : Promise.resolve({ data: [] }),
      ]);

      const schoolById = new Map((schoolsRes.data ?? []).map((s) => [s.id, s]));
      const actorById = new Map();
      for (const a of adminActorsRes.data ?? []) {
        actorById.set(a.auth_user_id, { name: `${a.first_name} ${a.last_name}`.trim(), role: a.role });
      }
      for (const a of schoolActorsRes.data ?? []) {
        if (!actorById.has(a.id)) {
          actorById.set(a.id, { name: `${a.first_name} ${a.last_name}`.trim(), role: a.role });
        }
      }

      const enabled = await readPlatformSettings(svc);

      return ok(res, {
        generatedAt: new Date().toISOString(),
        periodDays: days,
        retentionDays: enabled.settings.auditRetentionDays,
        total: count ?? 0,
        page,
        pageSize,
        rows: (rows ?? []).map((r) => ({
          id: r.id,
          schoolId: r.school_id,
          schoolName: r.school_id ? schoolById.get(r.school_id)?.name ?? "Établissement supprimé" : null,
          actorId: r.actor_id,
          actorName: r.actor_id ? actorById.get(r.actor_id)?.name ?? null : null,
          actorRole: r.actor_role,
          action: r.action,
          entity: r.entity,
          entityId: r.entity_id,
          payload: r.payload ?? {},
          createdAt: r.created_at,
        })),
        actionCounts: Array.from(actionCounts.entries())
          .map(([value, total]) => ({ action: value, count: total }))
          .sort((a, b) => b.count - a.count),
      });
    }

    if (req.method === "DELETE") {
      const admin = await requireSuperAdmin(svc, req, res);
      if (!admin) return;
      const { caller, agent } = admin;
      await enforceRateLimit(svc, `admin-audit-purge:${caller.id}`, 5, 3600);

      const body = expectObject(req.body ?? {});
      const { settings } = await readPlatformSettings(svc);
      const defaultDays = settings.auditRetentionDays;
      const requested = body.olderThanDays === undefined ? defaultDays : Number(body.olderThanDays);
      if (!Number.isInteger(requested) || requested < 30 || requested > 3650) {
        throw new ValidationError("La purge doit porter sur une période de 30 à 3 650 jours.");
      }

      const cutoff = new Date(Date.now() - requested * 86_400_000).toISOString();
      const { count, error } = await svc
        .from("audit_log")
        .delete({ count: "exact" })
        .lt("created_at", cutoff);
      if (error) {
        logError("admin-audit", error);
        return serverError(res);
      }

      await auditAdmin(svc, {
        actorId: caller.id,
        actorRole: agent.role,
        action: "audit_log_purged",
        entity: "audit_log",
        entityId: null,
        payload: { olderThanDays: requested, cutoff, deleted: count ?? 0 },
      });

      return ok(res, {
        message: `${count ?? 0} événement(s) supprimé(s) du journal (antérieurs au ${cutoff.slice(0, 10)}).`,
        deleted: count ?? 0,
        cutoff,
      });
    }

    return ok(res, { error: "Méthode non autorisée." }, 405);
  } catch (e) {
    if (e instanceof ValidationError) return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("admin-audit", e);
    return serverError(res);
  }
});
