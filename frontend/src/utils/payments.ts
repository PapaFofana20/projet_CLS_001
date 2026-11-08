// Statuts des paiements, restes à payer et réduction fratrie.
import type { ManualPaymentStatus, Payment, PaymentStatus, PayMethod, StudentPayStatus } from "@/types";
import { todayIso } from "@/data/school";

// Déduit le statut d'un paiement selon le montant versé et la date d'échéance.
export function computeStatus(amount: number, paid: number, dueDate: string, today: string = todayIso()): PaymentStatus {
  if (paid >= amount) return "paye";
  if (paid > 0) return "partiel";
  return dueDate <= today ? "en_retard" : "a_venir";
}

export const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  wave: "Wave",
  orange_money: "Orange Money",
  free_money: "Free Money",
  especes: "Espèces",
};

export const PAY_STATUS_LABELS: Record<PaymentStatus, string> = {
  paye: "Payé",
  partiel: "Partiel",
  en_retard: "En retard",
  a_venir: "À venir",
};

/** Libellés du menu déroulant de la fiche élève : À venir (défaut) / Payé / Impayé. */
export const MANUAL_PAYMENT_LABELS: Record<ManualPaymentStatus, string> = {
  a_venir: "À venir",
  paye: "Payé",
  impaye: "Impayé",
};

/**
 * Statut affiché dans le menu déroulant d'une échéance.
 * Le choix manuel prime ; sinon on traduit le statut automatique :
 * en_retard -> Impayé, a_venir -> À venir. Un partiel automatique est
 * conservé tel quel (option supplémentaire) pour ne pas perdre l'info.
 */
export function manualChoiceOf(p: Payment): ManualPaymentStatus | "partiel" {
  if (p.manualStatus) return p.manualStatus;
  if (p.status === "paye") return "paye";
  if (p.status === "en_retard") return "impaye";
  if (p.status === "partiel") return "partiel";
  return "a_venir";
}

export const STUDENT_STATUS_LABELS: Record<StudentPayStatus, string> = {
  a_jour: "À jour",
  partiel: "Partiel",
  impaye: "Impayé",
};

// Montant qu'il reste à régler sur un paiement.
export function remaining(p: Payment): number {
  return Math.max(0, p.amount - p.paidAmount);
}

// Statut global d'un élève à partir de ses échéances échues.
export function studentPayStatus(payments: Payment[]): StudentPayStatus {
  const due = payments.filter((p) => p.dueDate <= todayIso());
  if (due.some((p) => p.status === "en_retard")) return "impaye";
  if (due.some((p) => p.status === "partiel")) return "partiel";
  return "a_jour";
}

// Addition simple d'une liste de montants.
export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Mensualité après réduction fratrie, arrondie à 500 FCFA. */
export function discountedMonthly(base: number, discountPercent: number): number {
  return Math.round((base * (1 - discountPercent / 100)) / 500) * 500;
}
