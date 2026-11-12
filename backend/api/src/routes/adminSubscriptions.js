/**
 * Abonnements vus par l'administration :
 *  - état réel de chaque établissement (actif / expire / aucun) ;
 *  - demandes d'activation déposées par les directions ;
 *  - activation ou prolongation manuelle par le support (RPC idempotente
 *    `activate_school_subscription`, réservée au service_role).
 *
 * Aucune donnée n'est inventée : les montants et les formules viennent de
 * public.plans et public.subscriptions. Un agent de suivi peut consulter,
 * seuls admin et superadmin peuvent activer.
 */
import { auditAdmin, requireAdminRole, serviceClient } from "../lib/authAdmin.js";
import { badRequest, forbidden, notFound, ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { daysBetween, todayIso } from "../lib/periods.js";
import { enforceRateLimit } from "../lib/rateLimit.js";
import { expectObject, optionalString, requireString, requireUuid, ValidationError } from "../lib/validate.js";

const METHODS = new Set(["wave", "orange_money", "free_money", "especes"]);
const STATUSES = new Set(["all", "ACTIF", "EXPIRE", "AUCUN", "BIENTOT", "SUSPENDUE"]);
const MAX_AMOUNT = 10_000_000;

/** Nettoie le terme de recherche avant filtrage en mémoire.
 * Aucun échappement LIKE n'est nécessaire ici : le filtrage utilise
 * String.includes() (pas de requête SQL ilike). On ne remplace surtout
 * PAS '%' par un espace, sinon une recherche comme "100%" ne trouve rien. */
function sanitizeSearch(value) {
  return String(value ?? "").trim().slice(0, 60);
}

/** Prix mensuel d'une formule, 0 si absent (évite les NaN dans les totaux). */
function planPrice(plan) {
  return Number(plan?.monthly_price ?? 0);
}

/** Valide le montant saisi pour une activation manuelle. Entrée : corps. Sortie : entier ou null si absent. */
function requestAmount(body) {
  if (body.amount === undefined || body.amount === null || body.amount === "") return null;
  const n = Number(body.amount);
  if (!Number.isInteger(n) || n < 0 || n > MAX_AMOUNT) {
    throw new ValidationError("Le montant doit être un entier positif (10 000 000 FCFA maximum).");
  }
  return n;
}

// Handler principal : GET/POST /admin/subscriptions — consultation et activation manuelle.
export default route(async (req, res) => {
  const svc = serviceClient();
  try {
    const admin = await requireAdminRole(svc, req, res);
    if (!admin) return;
    const { caller, agent } = admin;

    if (req.method === "GET") {
      await enforceRateLimit(svc, `admin-subscriptions:${caller.id}`, 30, 300);
      return listSubscriptions(svc, res, req);
    }

    if (req.method === "POST") {
      if (caller.role === "agent_suivi") {
        return forbidden(res, "Un agent de suivi peut consulter les abonnements mais pas les activer.");
      }
      await enforceRateLimit(svc, `admin-subscriptions-write:${caller.id}`, 15, 300);
      const body = expectObject(req.body);

      if (body.action === "activate") {
        const schoolId = requireUuid(body, "schoolId", "L'identifiant de l'établissement");
        const planId = requireString(body, "planId", "La formule", { min: 1, max: 40 });
        const cycle = requireString(body, "cycle", "Le cycle de facturation", { min: 1, max: 10 });
        if (!["monthly", "yearly"].includes(cycle)) {
          return badRequest(res, "Cycle de facturation invalide (monthly ou yearly).");
        }
        const method = optionalString(body, "method", "Le moyen de paiement", 20) || "especes";
        if (!METHODS.has(method)) return badRequest(res, "Moyen de paiement invalide.");
        const reference = optionalString(body, "reference", "La référence de paiement", 60) ?? "";
        const amount = requestAmount(body);

        const { data: school } = await svc
          .from("schools")
          .select("id, name, matricule")
          .eq("id", schoolId)
          .maybeSingle();
        if (!school) return notFound(res, "Établissement introuvable.");

        const { data: plan } = await svc.from("plans").select("id, name").eq("id", planId).maybeSingle();
        if (!plan) return badRequest(res, "Formule d'abonnement introuvable.");

        const { data: activation, error } = await svc.rpc("activate_school_subscription", {
          p_school_id: schoolId,
          p_plan_id: planId,
          p_cycle: cycle,
          p_amount_paid: amount,
          p_payment_ref: reference,
          p_method: method,
        });
        if (error) {
          logError("admin-subscriptions", error);
          // Message générique au client : le message SQL brut (schéma,
          // contraintes) ne doit jamais fuiter — il est journalisé ci-dessus.
          return badRequest(res, "Impossible d'activer cet abonnement. Vérifiez les données saisies.");
        }

        await auditAdmin(svc, {
          schoolId,
          actorId: caller.id,
          actorRole: agent.role,
          action: "subscription_activated_manually",
          entity: "subscriptions",
          entityId: schoolId,
          payload: {
            plan: planId,
            cycle,
            method,
            amount: activation?.amount_paid ?? amount,
            reference: activation?.payment_ref ?? reference,
            endsAt: activation?.ends_at,
            source: "admin_console",
          },
        });

        return ok(res, {
          message: `Abonnement ${activation?.plan_name ?? plan.name} activé pour ${school.name}.`,
          activation,
        });
      }

      if (body.action === "cancelRequest") {
        const requestId = requireUuid(body, "requestId", "L'identifiant de la demande");
        const { data: request } = await svc
          .from("subscription_requests")
          .select("id, school_id, status")
          .eq("id", requestId)
          .maybeSingle();
        if (!request || request.status !== "EN_ATTENTE") {
          return notFound(res, "Demande introuvable ou déjà traitée.");
        }
        const { error } = await svc
          .from("subscription_requests")
          .update({ status: "ANNULEE", decided_at: new Date().toISOString() })
          .eq("id", requestId);
        if (error) return serverError(res);

        await auditAdmin(svc, {
          schoolId: request.school_id,
          actorId: caller.id,
          actorRole: agent.role,
          action: "subscription_request_cancelled",
          entity: "subscription_requests",
          entityId: requestId,
          payload: { reason: optionalString(body, "reason", "Le motif", 200) ?? "" },
        });

        return ok(res, { message: "Demande annulée." });
      }

      return badRequest(res, "Action inconnue.");
    }

    return ok(res, { error: "Méthode non autorisée." }, 405);
  } catch (e) {
    if (e instanceof ValidationError) return badRequest(res, e.message);
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("admin-subscriptions", e);
    return serverError(res);
  }
});

/** Assemple la liste paginée des abonnements avec filtres et résumé. Entrée : svc, res, req. */
async function listSubscriptions(svc, res, req) {
  const today = todayIso();

  const rawPage = parseInt(req.query.page ?? "1", 10);
  const rawPageSize = parseInt(req.query.pageSize ?? "20", 10);
  const page = Number.isInteger(rawPage) ? Math.max(1, rawPage) : 1;
  const pageSize = Number.isInteger(rawPageSize) ? Math.min(100, Math.max(1, rawPageSize)) : 20;
  const search = sanitizeSearch(req.query.search);
  const rawStatus = String(req.query.status ?? "all");
  const status = STATUSES.has(rawStatus) ? rawStatus : "all";
  const planFilter = String(req.query.plan ?? "");

  const schoolQuery = svc
    .from("schools")
    .select("id, name, matricule, city, registration_open, created_at")
    .order("name")
    .limit(5000);

  const REQUEST_FIELDS =
    "id, school_id, plan_id, cycle, student_count, amount, status, created_at, decided_at, plans(name)";

  const [
    { data: schools, error: schoolsError },
    { data: subs, error: subsError },
    { data: plans, error: plansError },
    { data: pendingRequests, error: requestsError },
    { data: pastRequests },
  ] = await Promise.all([
    schoolQuery,
    svc
      .from("subscriptions")
      .select("school_id, plan_id, starts_at, ends_at, student_limit, amount_paid, method, paid_at, plans(id, name, monthly_price, yearly_price, student_limit)")
      .limit(5000),
    svc.from("plans").select("*").order("monthly_price"),
    svc
      .from("subscription_requests")
      .select(REQUEST_FIELDS)
      .eq("status", "EN_ATTENTE")
      .order("created_at", { ascending: true }),
    svc
      .from("subscription_requests")
      .select(REQUEST_FIELDS)
      .neq("status", "EN_ATTENTE")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const requests = [...(pendingRequests ?? []), ...(pastRequests ?? [])];

  if (schoolsError) throw new Error("Impossible de charger les établissements.");
  if (subsError) throw new Error("Impossible de charger les abonnements.");
  if (plansError) throw new Error("Impossible de charger les formules.");
  if (requestsError) throw new Error("Impossible de charger les demandes d'abonnement.");

  const plansById = new Map((plans ?? []).map((p) => [p.id, p]));
  const subBySchool = new Map((subs ?? []).map((s) => [s.school_id, s]));
  const schoolById = new Map((schools ?? []).map((s) => [s.id, s]));

  // Lignes complètes (avant filtrage).
  const allRows = (schools ?? []).map((school) => {
    const sub = subBySchool.get(school.id) ?? null;
    const plan = sub?.plans ?? (sub ? plansById.get(sub.plan_id) : null) ?? null;
    const endsAt = sub?.ends_at ?? null;
    const statusValue = !endsAt ? "AUCUN" : endsAt < today ? "EXPIRE" : "ACTIF";
    const daysLeft = endsAt ? daysBetween(today, endsAt) : null;
    return {
      schoolId: school.id,
      schoolName: school.name,
      matricule: school.matricule ?? "",
      city: school.city ?? "",
      planId: sub?.plan_id ?? null,
      planName: plan?.name ?? null,
      planMonthlyPrice: planPrice(plan),
      startsAt: sub?.starts_at ?? null,
      endsAt,
      daysLeft,
      amountPaid: Number(sub?.amount_paid ?? 0),
      method: sub?.method ?? null,
      paidAt: sub?.paid_at ?? null,
      studentLimit: sub?.student_limit ?? null,
      status: statusValue,
      registrationOpen: school.registration_open === true,
      expiringSoon: statusValue === "ACTIF" && daysLeft !== null && daysLeft <= 30,
    };
  });

  const activeRows = allRows.filter((r) => r.status === "ACTIF");
  const summary = {
    totalSchools: allRows.length,
    active: activeRows.length,
    expiringSoon: activeRows.filter((r) => r.expiringSoon).length,
    expired: allRows.filter((r) => r.status === "EXPIRE").length,
    none: allRows.filter((r) => r.status === "AUCUN").length,
    suspendedSchools: allRows.filter((r) => !r.registrationOpen).length,
    pendingRequests: (requests ?? []).filter((r) => r.status === "EN_ATTENTE").length,
    pendingRequestsAmount: (requests ?? [])
      .filter((r) => r.status === "EN_ATTENTE")
      .reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
    mrr: activeRows.reduce((sum, r) => sum + r.planMonthlyPrice, 0),
    arr: activeRows.reduce((sum, r) => sum + r.planMonthlyPrice, 0) * 12,
  };

  let filtered = allRows;
  if (search) {
    const term = search.toLowerCase();
    filtered = filtered.filter((r) =>
      [r.schoolName, r.matricule, r.city].some((value) => String(value ?? "").toLowerCase().includes(term)),
    );
  }
  if (status === "ACTIF") filtered = filtered.filter((r) => r.status === "ACTIF");
  else if (status === "EXPIRE") filtered = filtered.filter((r) => r.status === "EXPIRE");
  else if (status === "AUCUN") filtered = filtered.filter((r) => r.status === "AUCUN");
  else if (status === "BIENTOT") filtered = filtered.filter((r) => r.expiringSoon);
  else if (status === "SUSPENDUE") filtered = filtered.filter((r) => !r.registrationOpen);
  if (planFilter) filtered = filtered.filter((r) => r.planId === planFilter);

  filtered = [...filtered].sort((a, b) => {
    const rank = { ACTIF: 1, EXPIRE: 2, AUCUN: 3 };
    const diff = (rank[a.status] ?? 4) - (rank[b.status] ?? 4);
    if (diff !== 0) return diff;
    return a.schoolName.localeCompare(b.schoolName, "fr");
  });

  const total = filtered.length;
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const activeByPlan = new Map();
  for (const row of activeRows) {
    if (!row.planId) continue;
    activeByPlan.set(row.planId, (activeByPlan.get(row.planId) ?? 0) + 1);
  }
  const revenueByPlan = new Map();
  for (const sub of subs ?? []) {
    revenueByPlan.set(sub.plan_id, (revenueByPlan.get(sub.plan_id) ?? 0) + Number(sub.amount_paid ?? 0));
  }

  return ok(res, {
    generatedAt: new Date().toISOString(),
    summary,
    subscriptions: { rows: pageRows, total, page, pageSize },
    plans: (plans ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      tagline: p.tagline ?? "",
      studentLimit: p.student_limit,
      monthlyPrice: Number(p.monthly_price ?? 0),
      yearlyPrice: Number(p.yearly_price ?? 0),
      features: p.features ?? [],
      highlight: p.highlight === true,
      activeSchools: activeByPlan.get(p.id) ?? 0,
      totalRevenue: revenueByPlan.get(p.id) ?? 0,
      mrr: (activeByPlan.get(p.id) ?? 0) * Number(p.monthly_price ?? 0),
    })),
    requests: (requests ?? []).map((r) => {
      const school = schoolById.get(r.school_id);
      return {
        id: r.id,
        schoolId: r.school_id,
        schoolName: school?.name ?? "Établissement supprimé",
        matricule: school?.matricule ?? "",
        planId: r.plan_id,
        planName: r.plans?.name ?? plansById.get(r.plan_id)?.name ?? r.plan_id,
        cycle: r.cycle,
        studentCount: Number(r.student_count ?? 0),
        amount: Number(r.amount ?? 0),
        status: r.status,
        createdAt: r.created_at,
        decidedAt: r.decided_at,
      };
    }),
  });
}
