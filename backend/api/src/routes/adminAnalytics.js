/**
 * Analyses et statistiques : croissance réelle des établissements, effectifs,
 * conversion vers les formules payantes et répartition géographique.
 * Toutes les valeurs sont calculées à partir des tables de production.
 */
import { requireAdminRole, serviceClient } from "../lib/authAdmin.js";
import { ok, route, serverError, RATE_LIMIT_RE, logError } from "../lib/http.js";
import { planMonthlyAmount } from "../lib/planPricing.js";
import { lastMonths, todayIso } from "../lib/periods.js";
import { enforceRateLimit } from "../lib/rateLimit.js";

const CYCLE_LABELS = {
  elementaire: "Élémentaire",
  moyen: "Moyen",
  secondaire: "Secondaire",
};

/** Pourcentage arrondi à une décimale, 0 si le total est nul. */
function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

// Handler principal : GET /admin/analytics — tableau de bord analytique réservé aux agents admin.
export default route(async (req, res) => {
  if (req.method !== "GET") return ok(res, { error: "Méthode non autorisée." }, 405);
  const svc = serviceClient();
  try {
    const admin = await requireAdminRole(svc, req, res);
    if (!admin) return;
    const { caller } = admin;

    await enforceRateLimit(svc, `admin-analytics:${caller.id}`, 30, 300);

    const today = todayIso();
    const months = lastMonths(12);

    const [
      { data: schools, error: schoolsError },
      { data: subs, error: subsError },
      { data: plans, error: plansError },
      { count: totalStudents },
      { count: totalClasses },
      { count: totalTeachers },
      { count: totalParents },
      { data: stats, error: statsError },
      monthlyCounts,
    ] = await Promise.all([
      svc.from("schools").select("id, name, city, cycles, created_at, registration_open").limit(5000),
      svc.from("subscriptions").select("school_id, plan_id, ends_at").limit(5000),
      svc.from("plans").select("id, name, monthly_price, price_per_student, on_quote").order("sort_order"),
      svc.from("students").select("*", { count: "exact", head: true }),
      svc.from("class_rooms").select("*", { count: "exact", head: true }),
      svc.from("profiles").select("*", { count: "exact", head: true }).in("role", ["professeur", "instituteur"]),
      svc.from("profiles").select("*", { count: "exact", head: true }).eq("role", "parent"),
      svc.rpc("admin_school_stats"),
      Promise.all(
        months.map(async (m) => {
          const [schoolsRes, studentsRes] = await Promise.all([
            svc
              .from("schools")
              .select("*", { count: "exact", head: true })
              .gte("created_at", m.startsAt)
              .lt("created_at", m.endsBefore),
            svc
              .from("students")
              .select("*", { count: "exact", head: true })
              .gte("created_at", m.startsAt)
              .lt("created_at", m.endsBefore),
          ]);
          return {
            key: m.key,
            label: m.label,
            newSchools: schoolsRes.count ?? 0,
            newStudents: studentsRes.count ?? 0,
          };
        }),
      ),
    ]);

    if (schoolsError) throw new Error("Impossible de charger les établissements.");
    if (subsError) throw new Error("Impossible de charger les abonnements.");
    if (plansError) throw new Error("Impossible de charger les formules.");
    if (statsError) throw new Error("Impossible de charger les statistiques par établissement.");

    const allSchools = schools ?? [];
    const subBySchool = new Map((subs ?? []).map((s) => [s.school_id, s]));
    const planById = new Map((plans ?? []).map((p) => [p.id, p]));
    const activeSchools = allSchools.filter((s) => {
      const sub = subBySchool.get(s.id);
      return s.registration_open === true && sub?.ends_at && sub.ends_at >= today;
    });
    const payingSchools = allSchools.filter((s) => {
      const sub = subBySchool.get(s.id);
      return sub?.ends_at && sub.ends_at >= today;
    });
    const expiredSubs = (subs ?? []).filter((s) => s.ends_at && s.ends_at < today);

    // Croissance : cumul des écoles créées à la fin de chaque mois.
    let cumulative = 0;
    const growth = months.map((m, index) => {
      cumulative = allSchools.filter((s) => String(s.created_at).slice(0, 10) < m.endsBefore).length;
      const counts = monthlyCounts[index];
      return {
        key: m.key,
        label: m.label,
        newSchools: counts.newSchools,
        newStudents: counts.newStudents,
        totalSchools: cumulative,
      };
    });

    const current = growth[growth.length - 1] ?? { newSchools: 0, totalSchools: 0 };
    const previous = growth[growth.length - 2] ?? { newSchools: 0, totalSchools: 0 };
    const schoolsGrowthPct =
      previous.totalSchools > 0
        ? Math.round(((current.totalSchools - previous.totalSchools) / previous.totalSchools) * 1000) / 10
        : 0;

    const statsRows = stats ?? [];
    const studentsBySchool = new Map(statsRows.map((s) => [s.school_id, Number(s.student_count ?? 0)]));
    const totalStudentsSchools = statsRows.reduce((sum, s) => sum + Number(s.student_count ?? 0), 0);

    // Villes : nombre d'écoles et effectif cumulé observé.
    const cityMap = new Map();
    for (const s of allSchools) {
      const city = (s.city || "Non renseignée").trim();
      const entry = cityMap.get(city) ?? { city, schools: 0, students: 0 };
      entry.schools += 1;
      entry.students += studentsBySchool.get(s.id) ?? 0;
      cityMap.set(city, entry);
    }

    // Cycles : nombre d'écoles qui proposent chaque cycle.
    const cycleCounts = { elementaire: 0, moyen: 0, secondaire: 0 };
    for (const s of allSchools) {
      for (const cycle of s.cycles ?? []) {
        if (cycle in cycleCounts) cycleCounts[cycle] += 1;
      }
    }

    const activeByPlan = new Map();
    for (const s of payingSchools) {
      const planId = subBySchool.get(s.id)?.plan_id;
      if (planId) activeByPlan.set(planId, (activeByPlan.get(planId) ?? 0) + 1);
    }

    return ok(res, {
      generatedAt: new Date().toISOString(),
      summary: {
        totalSchools: allSchools.length,
        activeSchools: activeSchools.length,
        payingSchools: payingSchools.length,
        newSchoolsThisMonth: current.newSchools,
        newSchoolsLastMonth: previous.newSchools,
        schoolsGrowthPct,
        studentsThisMonth: current.newStudents,
        studentsLastMonth: previous.newStudents,
        totalStudents: totalStudents ?? totalStudentsSchools,
        totalClasses: totalClasses ?? 0,
        totalTeachers: totalTeachers ?? 0,
        totalParents: totalParents ?? 0,
        averageStudentsPerSchool: allSchools.length ? Math.round(totalStudentsSchools / allSchools.length) : 0,
        conversionRate: pct(payingSchools.length, allSchools.length),
        churnRate: pct(expiredSubs.length, (subs ?? []).length),
        mrr: payingSchools.reduce(
          (sum, s) =>
            sum +
            planMonthlyAmount(
              planById.get(subBySchool.get(s.id)?.plan_id),
              studentsBySchool.get(s.id) ?? 0,
            ),
          0,
        ),
      },
      growth,
      byCity: Array.from(cityMap.values())
        .sort((a, b) => b.schools - a.schools || b.students - a.students)
        .slice(0, 10),
      byCycle: Object.entries(cycleCounts).map(([cycle, count]) => ({
        cycle,
        label: CYCLE_LABELS[cycle] ?? cycle,
        schools: count,
      })),
      byPlan: (plans ?? []).map((p) => ({
        planId: p.id,
        name: p.name,
        monthlyPrice: Number(p.monthly_price ?? 0),
        pricePerStudent: Number(p.price_per_student ?? 0),
        onQuote: p.on_quote === true,
        schools: activeByPlan.get(p.id) ?? 0,
        share: pct(activeByPlan.get(p.id) ?? 0, payingSchools.length),
      })),
      topSchools: statsRows
        .slice()
        .sort((a, b) => Number(b.student_count ?? 0) - Number(a.student_count ?? 0))
        .slice(0, 8)
        .map((s) => ({
          schoolId: s.school_id,
          schoolName: s.school_name,
          matricule: s.matricule ?? "",
          students: Number(s.student_count ?? 0),
          classes: Number(s.class_count ?? 0),
          teachers: Number(s.teacher_count ?? 0),
          subscriptionStatus: s.subscription_status ?? "AUCUN",
        })),
    });
  } catch (e) {
    if (e instanceof Error && RATE_LIMIT_RE.test(e.message)) return ok(res, { error: e.message }, 429);
    logError("admin-analytics", e);
    return serverError(res);
  }
});
