import { formatCurrency, formatDate } from "./format";
import { daysUntil } from "./dates";

/**
 * Relances impayés — envoi via WhatsApp (aucune API tierce requise) :
 * chaque ligne génère un lien wa.me pré-rempli + le message est copiable.
 * Niveaux de ton selon l'ancienneté de la dette.
 */

export type ReminderLevel = "doux" | "ferme" | "urgent";

export interface ReminderLine {
  label: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
}

export interface ReminderInput {
  schoolName: string;
  studentName: string;
  className: string;
  parentFirstName: string;
  total: number;
  lines: ReminderLine[];
  maxOverdueDays: number;
}

// Choix du ton de relance selon l'ancienneté de la plus vieille échéance impayée.
export function reminderLevelOf(maxOverdueDays: number): ReminderLevel {
  if (maxOverdueDays >= 30) return "urgent";
  if (maxOverdueDays >= 7) return "ferme";
  return "doux";
}

// Titre du message de relance, assorti au niveau de ton.
export function reminderSubject(level: ReminderLevel): string {
  return level === "urgent" ? "Relance urgente — impayés" : level === "ferme" ? "Relance — impayés" : "Rappel — échéances";
}

// Rédige le message WhatsApp de relance avec le détail des sommes dues.
export function buildReminderMessage(input: ReminderInput): string {
  const level = reminderLevelOf(input.maxOverdueDays);
  const detail = input.lines
    .map((l) => `• ${l.label} (échéance ${formatDate(l.dueDate)}) : reste ${formatCurrency(l.amount - l.paidAmount)}`)
    .join("\n");
  const hello = level === "doux"
    ? `Bonjour ${input.parentFirstName} 👋`
    : `Bonjour ${input.parentFirstName},`;
  const body = level === "doux"
    ? `petit rappel de l'école *${input.schoolName}* : des frais de scolarité sont à régulariser pour *${input.studentName}* (${input.className}).`
    : level === "ferme"
      ? `rappel de l'école *${input.schoolName}* : les frais de scolarité de *${input.studentName}* (${input.className}) sont en retard. Merci de régulariser sous peu.`
      : `message important de l'école *${input.schoolName}* : les frais de scolarité de *${input.studentName}* (${input.className}) accusent un retard important (${input.maxOverdueDays} jours). Merci de régulariser immédiatement.`;
  return [
    hello,
    body,
    "",
    detail,
    "",
    `Total à régler : *${formatCurrency(input.total)}*`,
    `Paiements en espèces au secrétariat. Merci de nous confirmer dès que c'est fait.`,
    `— Direction de ${input.schoolName} —`,
  ].join("\n");
}

/** wa.me attend le numéro international sans + : 22177… */
export function toIntlPhone(snPhone: string): string {
  const digits = snPhone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("221") && digits.length === 12) return digits;
  if (digits.length === 9) return `221${digits}`;
  return digits;
}

// Construit le lien WhatsApp prêt à ouvrir, ou null si le numéro est introuvable.
export function whatsappReminderLink(snPhone: string, message: string): string | null {
  const intl = toIntlPhone(snPhone);
  if (!intl) return null;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

/** Export CSV de la liste des impayés (pour appel terrain / suivi). */
export function debtorsToCsv(rows: Array<{ studentName: string; className: string; parentName: string; parentPhone: string; count: number; total: number }>): string {
  // Protection formule : une cellule commençant par =, +, -, @ serait
  // exécutée comme formule à l'ouverture dans Excel/LibreOffice (les noms
  // viennent de saisies tiers). Préfixe apostrophe dans ce cas.
  const esc = (v: string | number) => {
    let text = String(v);
    if (/^[=+\-@]/.test(text.trimStart())) text = `'${text}`;
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ["eleve", "classe", "parent", "telephone", "echeances", "total_du"];
  const lines = rows.map((r) => [r.studentName, r.className, r.parentName, r.parentPhone, r.count, r.total].map(esc).join(";"));
  return [header.join(";"), ...lines].join("\r\n");
}

// Télécharge la liste des familles débiteur fiche CSV pour un suivi hors ligne.
export function downloadDebtorsCsv(rows: Array<{ studentName: string; className: string; parentName: string; parentPhone: string; count: number; total: number }>): void {
  const blob = new Blob(["\uFEFF" + debtorsToCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `impayes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Retrouve la plus vieille échéance pour décider du ton de la relance.
export function maxOverdueDays(dueDates: string[], todayIso: string): number {
  if (dueDates.length === 0) return 0;
  const oldest = dueDates.reduce((min, d) => (d < min ? d : min), dueDates[0]!);
  return Math.max(0, -daysUntil(oldest, todayIso));
}
