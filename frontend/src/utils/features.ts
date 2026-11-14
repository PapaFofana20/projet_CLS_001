import { subscriptionInfoOf } from "@/services/subscriptionService";
import { useSchool } from "@/context/SchoolContext";
import type { PlanId } from "@/types";

/**
 * Fonctionnalités premium gatees par plan d'abonnement.
 * Basé sur les features listées dans data/plans.ts
 */
export type FeatureKey =
  /** Plans Pro+ */
  | "mobile_payments"           // Paiements Wave / Orange Money / Free Money
  | "auto_reminders"            // Rappels automatiques des impayés
  | "scheduling"                // Affectations et emplois du temps (disponible dès le plan Découverte)
  /** Plans Premium+ */
  | "staff_accounts"            // Comptes économe, secrétaire, surveillant (disponible dès le plan Découverte)
  | "data_export"               // Export des données et rapports
  /** Plans Illimité */
  | "multi_campus";             // Multi-sièges / multi-campus

/** Ordre des plans pour la comparaison */
const PLAN_ORDER: PlanId[] = ["essentiel", "pro", "premium", "illimite"];

/** Niveau minimum requis pour chaque fonctionnalité */
const FEATURE_REQUIREMENTS: Record<FeatureKey, PlanId> = {
  mobile_payments: "pro",
  auto_reminders: "pro",
  scheduling: "essentiel",
  staff_accounts: "essentiel",
  data_export: "premium",
  multi_campus: "illimite",
};

/**
 * Vérifie si une fonctionnalité est disponible pour l'école actuelle.
 * À utiliser côté client pour masquer/désactiver des UI.
 */
export function hasFeature(feature: FeatureKey, schoolId: string): boolean {
  const info = subscriptionInfoOf(schoolId);
  if (!info.plan) return false;
  // Normalisation des ids de formule : « reseau » (landing) correspond à
  // « illimite » (catalogue backend). Un plan inconnu reste bloquant.
  const rawId = info.plan.id as string;
  const normalizedId = rawId === "reseau" ? "illimite" : rawId;
  const currentPlanIndex = PLAN_ORDER.indexOf(normalizedId as PlanId);
  const requiredPlanIndex = PLAN_ORDER.indexOf(FEATURE_REQUIREMENTS[feature]);
  if (currentPlanIndex === -1) return false; // Fail-closed : plan inconnu/corrompu = aucune feature premium.
  return currentPlanIndex >= requiredPlanIndex;
}

/**
 * Vérifie si une fonctionnalité est disponible pour une école donnée.
 * Pour usage dans les services (côté serveur ou client avec schoolId).
 */
export function hasFeatureForSchool(schoolId: string, feature: FeatureKey): boolean {
  return hasFeature(feature, schoolId);
}

/**
 * Retourne le label du plan requis pour une fonctionnalité.
 * Utile pour les messages d'erreur.
 */
export function getRequiredPlanLabel(feature: FeatureKey): string {
  const planId = FEATURE_REQUIREMENTS[feature];
  const plan = PLAN_ORDER.find(p => p === planId);
  if (!plan) return "Premium";
  
  const labels: Record<PlanId, string> = {
    essentiel: "Plan découverte",
    pro: "Pro",
    premium: "Premium",
    illimite: "Illimité",
  };
  return labels[planId] ?? "Premium";
}

/**
 * Vérifie et lève une erreur si la fonctionnalité n'est pas disponible.
 * À utiliser dans les actions critiques (création de compte staff, etc.)
 */
export function requireFeature(feature: FeatureKey, schoolId: string): void {
  const has = hasFeature(feature, schoolId);
  if (!has) {
    const planLabel = getRequiredPlanLabel(feature);
    throw new Error(`Cette fonctionnalité nécessite le plan ${planLabel} ou supérieur.`);
  }
}

/**
 * Hook React pour vérifier une fonctionnalité dans un composant.
 */
export function useFeature(feature: FeatureKey): boolean {
  const { schoolId } = useSchool();
  return hasFeature(feature, schoolId);
}