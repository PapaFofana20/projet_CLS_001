/**
 * Tarification des formules — miroir de frontend/src/utils/planPrice.ts.
 *
 * Offres réelles : Découverte (gratuit, 100 élèves), Premium (500 FCFA par
 * élève et par mois) et Groupe scolaire (sur devis). Les formules à prix fixe
 * restent supportées via monthly_price / yearly_price.
 *
 * Convention annuelle : 10 mois facturés (2 mois offerts).
 */

/** Nombre de mois facturés pour un règlement annuel. */
export const YEARLY_MONTHS = 10;

const studentsOf = (value) => Math.max(0, Math.trunc(Number(value) || 0));

/** Tarif mensuel réel : par élève si la formule est facturée à l'élève, sinon forfait. */
export function planMonthlyAmount(plan, students = 0) {
  if (!plan || plan.on_quote === true) return 0;
  const perStudent = Number(plan.price_per_student ?? 0);
  if (perStudent > 0) return perStudent * studentsOf(students);
  return Number(plan.monthly_price ?? 0);
}

/** Tarif annuel réel (10 mois facturés), 0 pour les formules sur devis. */
export function planYearlyAmount(plan, students = 0) {
  if (!plan || plan.on_quote === true) return 0;
  const perStudent = Number(plan.price_per_student ?? 0);
  if (perStudent > 0) return perStudent * studentsOf(students) * YEARLY_MONTHS;
  return Number(plan.yearly_price ?? 0);
}
