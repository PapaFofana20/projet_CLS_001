import type { ManualPaymentStatus, Payment, SessionUser } from "@/types";
import { ensure } from "./access";
import { hydrate, paymentsOf, respond, studentsOf } from "./db";
import { supabase } from "@/lib/supabase";
import { toPaymentRow, type PaymentRow } from "./paymentRows";

// Paiements de l'école (table payments) : lecture, encaissement espèces et relances.

export type { PaymentRow };
const toRow = toPaymentRow;

/** Paiements de l'école de l'acteur (jamais ceux d'une autre école). */
export const listPaymentRows = (actor: SessionUser): Promise<PaymentRow[]> => respond(() => paymentsOf(actor.schoolId).map(toRow));

// Paiements visibles par un parent ou un élève (seulement ses enfants / lui-même).
export function listParentPayments(actor: SessionUser): Promise<PaymentRow[]> {
  return respond(() => {
    const ids = studentsOf(actor.schoolId).filter((s) => (actor.role === "eleve" ? s.id === actor.studentId : s.parentId === actor.parentId)).map((s) => s.id);
    return paymentsOf(actor.schoolId)
      .filter((p) => ids.includes(p.studentId))
      .map(toRow);
  });
}

// Paiements bruts d'un élève donné (sans l'enrichissement d'affichage).
export function listStudentPayments(schoolId: string, studentId: string): Promise<Payment[]> {
  return respond(() => paymentsOf(schoolId).filter((p) => p.studentId === studentId));
}

/** Encaissement espèces (économe / direction) via RPC serveur. */
export function recordCashPayment(actor: SessionUser, paymentId: string, amount: number): Promise<PaymentRow> {
  return (async () => {
    const { error } = await supabase.rpc("record_cash_payment", {
      p_payment_id: paymentId,
      p_amount: amount,
    });
    if (error) {
      if (error.message.includes("Montant invalide.")) throw new Error("Montant invalide.");
      if (error.message.includes("Échéance introuvable.")) throw new Error("Échéance introuvable.");
      if (error.message.includes("lecture seule")) throw new Error("Mode lecture seule : l'abonnement de votre école est expiré.");
      throw new Error("Impossible d'enregistrer l'encaissement. Réessayez.");
    }
    await hydrate("payments");
    const p = paymentsOf(actor.schoolId).find((x) => x.id === paymentId);
    ensure(!!p, "Échéance introuvable.");
    return toRow(p as Payment);
  })();
}

/** Choix manuel du statut d'une échéance (fiche élève) : À venir / Payé / Impayé. RPC serveur. */
export function setPaymentManualStatus(actor: SessionUser, paymentId: string, manualStatus: ManualPaymentStatus): Promise<PaymentRow> {
  return (async () => {
    const { error } = await supabase.rpc("set_payment_manual_status", {
      p_payment_id: paymentId,
      p_manual_status: manualStatus,
    });
    if (error) {
      if (error.message.includes("lecture seule")) throw new Error("Mode lecture seule : l'abonnement de votre école est expiré.");
      if (error.message.includes("Échéance introuvable.")) throw new Error("Échéance introuvable.");
      if (error.message.includes("Statut invalide.")) throw new Error("Statut invalide.");
      if (error.message.includes("Seuls")) throw new Error("Seuls l'économe et la direction modifient le statut de paiement.");
      throw new Error("Impossible de changer le statut. Réessayez.");
    }
    await hydrate("payments");
    const p = paymentsOf(actor.schoolId).find((x) => x.id === paymentId);
    ensure(!!p, "Échéance introuvable.");
    return toRow(p as Payment);
  })();
}

/** Relances impayés (direction / économe) : RPC serveur. */
export function sendReminders(studentIds: string[]): Promise<number> {
  return (async () => {
    const { data, error } = await supabase.rpc("send_reminders", {
      p_student_ids: studentIds,
    });
    if (error) throw new Error("Impossible d'envoyer les relances. Réessayez.");
    return Number(data ?? studentIds.length);
  })();
}