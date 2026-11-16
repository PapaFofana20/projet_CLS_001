/**
 * Tarification des formules Classora.
 *
 * Les offres réelles sont celles publiées sur le site : Découverte (gratuit,
 * 100 élèves), Premium (500 FCFA par élève et par mois) et Groupe scolaire
 * (sur devis). Le forfait mensuel/annuel reste supporté pour les formules à
 * prix fixe, mais la facturation par élève est désormais la règle.
 *
 * Convention annuelle : 10 mois facturés (2 mois offerts), comme l'ancien
 * catalogue et le badge « -2 mois » du parcours directeur.
 */
import { formatCurrency } from "@/utils/format";

/** Champs tarifaires communs au catalogue local et aux réponses de l'API admin. */
export interface PlanPricing {
  monthlyPrice: number;
  /** Forfait annuel (absent ou 0 quand la facturation se fait par élève). */
  yearlyPrice?: number;
  /** Tarif mensuel par élève (0 ou absent = forfait). */
  pricePerStudent?: number | null;
  /** Formule établie sur devis (pas de prix public). */
  onQuote?: boolean | null;
}

/** Nombre de mois facturés pour un règlement annuel. */
export const YEARLY_MONTHS = 10;

const studentsOf = (value: number): number => Math.max(0, Math.trunc(Number(value) || 0));

/** Tarif mensuel réel : par élève si la formule est facturée à l'élève, sinon forfait. */
export function planMonthlyAmount(plan: PlanPricing, students = 0): number {
  if (plan.onQuote) return 0;
  const perStudent = Number(plan.pricePerStudent ?? 0);
  if (perStudent > 0) return perStudent * studentsOf(students);
  return Number(plan.monthlyPrice ?? 0);
}

/** Tarif annuel réel (10 mois facturés). */
export function planYearlyAmount(plan: PlanPricing, students = 0): number {
  if (plan.onQuote) return 0;
  const perStudent = Number(plan.pricePerStudent ?? 0);
  if (perStudent > 0) return perStudent * studentsOf(students) * YEARLY_MONTHS;
  return Number(plan.yearlyPrice ?? 0);
}
/** Prix à afficher sur une carte ou une ligne de tableau : « 500 FCFA / élève / mois ». */
export function planPriceLabel(plan: PlanPricing): string {
  if (plan.onQuote) return "Sur devis";
  const perStudent = Number(plan.pricePerStudent ?? 0);
  if (perStudent > 0) return `${formatCurrency(perStudent)} / élève / mois`;
  const monthly = Number(plan.monthlyPrice ?? 0);
  return monthly > 0 ? `${formatCurrency(monthly)} / mois` : "Gratuit";
}

/** Même libellé, mais accordé au cycle choisi (mensuel ou annuel). */
export function planCyclePriceLabel(plan: PlanPricing, cycle: "monthly" | "yearly"): string {
  if (plan.onQuote) return "Sur devis";
  const perStudent = Number(plan.pricePerStudent ?? 0);
  if (perStudent > 0) {
    const amount = perStudent * (cycle === "yearly" ? YEARLY_MONTHS : 1);
    return `${formatCurrency(amount)} / élève / ${cycle === "yearly" ? "an" : "mois"}`;
  }
  const monthly = Number(plan.monthlyPrice ?? 0);
  const amount = cycle === "yearly" ? Number(plan.yearlyPrice ?? 0) : monthly;
  return amount > 0 ? `${formatCurrency(amount)} / ${cycle === "yearly" ? "an" : "mois"}` : "Gratuit";
}

/** Précision tarifaire sous le prix (engagement, forfait, devis). */
export function planPriceHint(plan: PlanPricing): string {
  if (plan.onQuote) return "Tarif établi sur devis selon le nombre d'établissements";
  const perStudent = Number(plan.pricePerStudent ?? 0);
  if (perStudent > 0) {
    return `${formatCurrency(perStudent * YEARLY_MONTHS)} par élève et par an · 2 mois offerts`;
  }
  return Number(plan.monthlyPrice ?? 0) > 0 ? "Sans engagement" : "Sans frais, sans engagement";
}
