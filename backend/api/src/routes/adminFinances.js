/**
 * Finances Classora : revenus d'abonnement réellement encaissés.
 *
 * Depuis la migration 00016, le circuit paiement et `payment_transactions`
 * ont été retirés : la source de vérité est `subscription_events` (journal
 * immuable des activations/renouvellements) complétée par `subscriptions`.
 * Aucun montant n'est estimé à partir d'un prix forfaitaire inventé.
 */
import { requireAdminRole, serviceClient } from "../lib/authAdmin.js";
import { ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { daysBetween, lastMonths, monthKey, monthStartIso, todayIso } from "../lib/periods.js";
import { enforceRateLimit } from "../lib/rateLimit.js";

const EVENT_SELECT =
  "id, school_id, event_type, plan_id, amount_paid, method, payment_ref, starts_at, ends_at, created_at";

/** Récupère tout le journal par pages de 1 000 (plafond de sécurité 20 000). */
async function fetchAllEvents(svc) {
  const pageSize = 1000;
  const out = [];
  for (let page = 0; page < 20; page += 1) {
    const from = page * pageSize;
    const { data, error } = await svc
      .from("subscription_events")
      .select(EVENT_SELECT)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error("Impossible de charger le journal des abonnements.");
    out.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return out;
}

// Handler principal : GET /admin/finances — revenus d'abonnement réellement encaissés.
export default route(async (req, res) => {
  if (req.method !== "GET") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    const admin = await requireAdminRole(svc, req, res, ["admin", "superadmin"]);
    if (!admin) return;
    const { caller } = admin;

    await enforceRateLimit(svc, `admin-finances:${caller.id}`, 30, 300);

    const today = todayIso();
    const thisMonth = monthKey();
    const months = lastMonths(12);

    const [events, { data: subs, error: subsError }, { data: plans, error: plansError }, { data: schools }, { data: requests }] =
      await Promise.all([
        fetchAllEvents(svc),
        svc
          .from("subscriptions")
          .select("school_id, plan_id, starts_at, ends_at, amount_paid, method, paid_at")
          .limit(5000),
        svc.from("plans").select("id, name, monthly_price, yearly_price"),
        svc.from("schools").select("id, name, matricule").limit(5000),
        svc.from("subscription_requests").select("id, amount, status").eq("status", "EN_ATTENTE"),
      ]);

    if (subsError) throw new Error("Impossible de charger les abonnements.");
    if (plansError) throw new Error("Impossible de charger les formules.");

    const planById = new Map((plans ?? []).map((p) => [p.id, p]));
    const schoolById = new Map((schools ?? []).map((s) => [s.id, s]));
    const subBySchool = new Map((subs ?? []).map((s) => [s.school_id, s]));

    const amountOf = (e) => Number(e.amount_paid ?? 0);
    const revenueTotal = events.reduce((sum, e) => sum + amountOf(e), 0);
    const revenueThisMonth = events
      .filter((e) => String(e.created_at).slice(0, 7) === thisMonth)
      .reduce((sum, e) => sum + amountOf(e), 0);
    const previousMonth = months.length >= 2 ? months[months.length - 2].key : thisMonth;
    const revenueLastMonth = events
      .filter((e) => String(e.created_at).slice(0, 7) === previousMonth)
      .reduce((sum, e) => sum + amountOf(e), 0);
    const year = today.slice(0, 4);
    const revenueYtd = events
      .filter((e) => String(e.created_at).slice(0, 4) === year)
      .reduce((sum, e) => sum + amountOf(e), 0);

    const activeSubs = (subs ?? []).filter((s) => s.ends_at && s.ends_at >= today);
    const expiredSubs = (subs ?? []).filter((s) => s.ends_at && s.ends_at < today);
    const mrr = activeSubs.reduce((sum, s) => sum + Number(planById.get(s.plan_id)?.monthly_price ?? 0), 0);
    const atRiskMrr = expiredSubs.reduce((sum, s) => sum + Number(planById.get(s.plan_id)?.monthly_price ?? 0), 0);
    const renewalsDue30 = activeSubs.filter((s) => {
      const left = daysBetween(today, s.ends_at);
      return left !== null && left <= 30;
    });
    const renewalsDue30Amount = renewalsDue30.reduce(
      (sum, s) => sum + Number(planById.get(s.plan_id)?.monthly_price ?? 0),
      0,
    );
    const payingSchools = new Set(events.filter((e) => amountOf(e) > 0).map((e) => e.school_id)).size;
    const pendingRequests = requests ?? [];

    const summary = {
      revenueTotal,
      revenueThisMonth,
      revenueLastMonth,
      revenueYtd,
      mrr,
      arr: mrr * 12,
      averagePerPayingSchool: payingSchools > 0 ? Math.round(revenueTotal / payingSchools) : 0,
      payingSchools,
      activeSubscriptions: activeSubs.length,
      expiredSubscriptions: expiredSubs.length,
      atRiskMrr,
      renewalsDue30: renewalsDue30.length,
      renewalsDue30Amount,
      pendingRequests: pendingRequests.length,
      pendingRequestsAmount: pendingRequests.reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
      paidActivations: events.filter((e) => amountOf(e) > 0).length,
    };

    const monthly = months.map((m) => {
      const inMonth = events.filter((e) => String(e.created_at).slice(0, 7) === m.key);
      return {
        key: m.key,
        label: m.label,
        revenue: inMonth.reduce((sum, e) => sum + amountOf(e), 0),
        events: inMonth.length,
        purchases: inMonth.filter((e) => e.event_type === "purchase").length,
        renewals: inMonth.filter((e) => e.event_type === "renewal").length,
      };
    });

    const revenueByPlan = new Map();
    const countByPlan = new Map();
    for (const e of events) {
      if (!e.plan_id) continue;
      revenueByPlan.set(e.plan_id, (revenueByPlan.get(e.plan_id) ?? 0) + amountOf(e));
      countByPlan.set(e.plan_id, (countByPlan.get(e.plan_id) ?? 0) + 1);
    }
    const activeByPlan = new Map();
    for (const s of activeSubs) activeByPlan.set(s.plan_id, (activeByPlan.get(s.plan_id) ?? 0) + 1);

    const byPlan = (plans ?? []).map((p) => ({
      planId: p.id,
      name: p.name,
      monthlyPrice: Number(p.monthly_price ?? 0),
      activeSubscriptions: activeByPlan.get(p.id) ?? 0,
      activations: countByPlan.get(p.id) ?? 0,
      revenue: revenueByPlan.get(p.id) ?? 0,
      mrr: (activeByPlan.get(p.id) ?? 0) * Number(p.monthly_price ?? 0),
    }));

    const methodTotals = new Map();
    for (const e of events) {
      const method = e.method ?? "non_precise";
      const current = methodTotals.get(method) ?? { method, count: 0, amount: 0 };
      current.count += 1;
      current.amount += amountOf(e);
      methodTotals.set(method, current);
    }

    // Journal complet (plafonné) : les onglets Transactions et Factures
    // filtrent et paginent côté navigateur sans nouvelle requête.
    const mapEvent = (e) => {
      const school = schoolById.get(e.school_id);
      return {
        id: e.id,
        schoolId: e.school_id,
        schoolName: school?.name ?? "Établissement supprimé",
        matricule: school?.matricule ?? "",
        eventType: e.event_type,
        planId: e.plan_id,
        planName: planById.get(e.plan_id)?.name ?? e.plan_id ?? "—",
        amountPaid: amountOf(e),
        method: e.method,
        paymentRef: e.payment_ref ?? "",
        startsAt: e.starts_at,
        endsAt: e.ends_at,
        createdAt: e.created_at,
      };
    };
    const mappedEvents = events.slice(0, 1000).map(mapEvent);
    const recentEvents = mappedEvents.slice(0, 60);

    return ok(res, {
      generatedAt: new Date().toISOString(),
      today,
      monthStart: monthStartIso(),
      summary,
      monthly,
      byPlan,
      byMethod: Array.from(methodTotals.values()).sort((a, b) => b.amount - a.amount),
      recentEvents,
      events: mappedEvents,
      eventsTruncated: events.length > mappedEvents.length,
      schoolsWithSubscription: Array.from(subBySchool.keys()).length,
    });
  } catch (e) {
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("admin-finances", e);
    return serverError(res);
  }
});
