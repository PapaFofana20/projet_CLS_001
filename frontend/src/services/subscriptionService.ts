import type { Plan, PlanId, Subscription, SubscriptionStatus } from "@/types";
import { plans } from "@/data/plans";
import { todayIso as todayNow } from "@/data/school";
import { supabase } from "@/lib/supabase";
import { computeSubscriptionInfo, type SubscriptionInfo } from "@/utils/subscription";
import { db, hydrate, respond, schoolOf, studentsOf } from "./db";

// Abonnements (table subscriptions) et demandes d'activation (subscription_requests).

/** Dernière subscription connue d'une école (la plus récente). */
export function lastSubscription(schoolId: string): Subscription | null {
  const list = db.subscriptions.filter((s) => s.schoolId === schoolId).sort((a, b) => b.endsAt.localeCompare(a.endsAt));
  return list[0] ?? null;
}

/** Information d'abonnement d'une école (calcul synchrone, utilisé par les gardes). */
export function subscriptionInfoOf(schoolId: string, todayIso: string = todayNow()): SubscriptionInfo {
  return computeSubscriptionInfo(lastSubscription(schoolId), schoolOf(schoolId), studentsOf(schoolId).length, todayIso);
}

// Statut textuel de l'abonnement (ACTIF, EXPIRE…).
export function statusOf(schoolId: string): SubscriptionStatus {
  return subscriptionInfoOf(schoolId).status;
}

// Catalogue des formules (données statiques).
export const getPlans = (): Promise<Plan[]> => respond(() => plans);

// Infos d'abonnement calculées à partir du cache (statut, quotas, lecture seule).
export const getStatus = (schoolId: string, todayIso: string = todayNow()): Promise<SubscriptionInfo> => respond(() => subscriptionInfoOf(schoolId, todayIso));

// Historique des abonnements de l'école, le plus récent d'abord.
export const listSubscriptions = (schoolId: string): Promise<Subscription[]> =>
  respond(() => db.subscriptions.filter((s) => s.schoolId === schoolId).sort((a, b) => b.paidAt.localeCompare(a.paidAt)));

export type BillingCycle = "monthly" | "yearly";
export type SubscriptionRequestStatus = "EN_ATTENTE" | "ACTIVEE" | "ANNULEE";

export interface SubscriptionRequest {
  id: string;
  schoolId: string;
  planId: PlanId;
  cycle: BillingCycle;
  studentCount: number;
  amount: number;
  status: SubscriptionRequestStatus;
  createdAt: string;
  decidedAt: string | null;
}

function mapSubscriptionRequest(r: any): SubscriptionRequest {
  return {
    id: r.id,
    schoolId: r.school_id,
    planId: r.plan_id,
    cycle: r.cycle,
    studentCount: r.student_count,
    amount: r.amount,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at ?? null,
  };
}

/** Cree ou remplace la demande d'activation en attente du directeur connecte. */
export async function requestSubscriptionActivation(input: {
  planId: PlanId;
  cycle: BillingCycle;
  studentCount: number;
}): Promise<SubscriptionRequest> {
  const { data, error } = await supabase.rpc("request_subscription_activation", {
    p_plan_id: input.planId,
    p_cycle: input.cycle,
    p_student_count: input.studentCount,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Demande d'activation non enregistrée.");
  return mapSubscriptionRequest(data);
}

/** Derniere demande d'activation de l'ecole (lecture RLS directeur). */
export async function latestSubscriptionRequest(schoolId: string): Promise<SubscriptionRequest | null> {
  const { data, error } = await supabase
    .from("subscription_requests")
    .select("id, school_id, plan_id, cycle, student_count, amount, status, created_at, decided_at")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSubscriptionRequest(data) : null;
}

/**
 * Recharge le cache ecole/abonnements pour detecter une activation faite par
 * le support, puis laisse SchoolProvider recalculer son etat.
 */
export async function refreshSchoolSubscription(): Promise<void> {
  await Promise.all([hydrate("schools"), hydrate("subscriptions")]);
}

/**
 * L'achat en ligne est retiré pour l'instant : l'activation
 * d'un abonnement se fait manuellement, côté support (insertion SQL dans
 * `subscriptions`). Cette page reste en lecture seule pour le directeur.
 */