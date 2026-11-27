// Statut et limites d'un abonnement d'école : essai, lecture seule, blocage et plafond d'élèves.
import type { Plan, School, Subscription, SubscriptionStatus } from "@/types";
import { planById } from "@/data/plans";
import { addDaysIso, daysUntil } from "./dates";

/** Nombre de jours pendant lesquels l'école reste en lecture seule après l'échéance. */
export const READ_ONLY_DAYS = 7;

/** Nombre de jours d'alerte avant l'échéance. */
export const EXPIRY_WARNING_DAYS = 7;

/** Durée de l'essai gratuit (jours) pour une école sans abonnement — calculée depuis sa création. */
export const TRIAL_DAYS = 14;

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  subscription: Subscription | null;
  plan: Plan | null;
  /** Jours restants avant l'échéance (négatif si l'abonnement est expiré). */
  daysLeft: number;
  /** École expirée depuis moins de 7 jours : consultation possible, écriture bloquée. */
  readOnly: boolean;
  /** École expirée depuis plus de 7 jours : accès bloqué. */
  blocked: boolean;
  studentLimit: number | null;
  activeStudents: number;
  /** La limite d'élèves de la formule est atteinte. */
  limitReached: boolean;
  /** Essai gratuit : true si aucune subscription et école créée il y a moins de TRIAL_DAYS jours. */
  inTrial: boolean;
  /** Jours restants d'essai (0 si hors essai ou abonnement actif). */
  trialDaysLeft: number;
  /** Date ISO de fin d'essai, null si non applicable. */
  trialEndsAt: string | null;
}

/**
 * Statut d'abonnement calculé à partir de la date d'échéance.
 * Fonction pure : elle ne lit pas la base, elle reçoit tout en paramètre.
 */
export function computeSubscriptionInfo(
  subscription: Subscription | null,
  _school: School | undefined,
  activeStudents: number,
  todayIso: string,
): SubscriptionInfo {
  if (!subscription) {
    const created = _school?.createdAt ? _school.createdAt.slice(0, 10) : null;
    const trialEndsAt = created ? addDaysIso(created, TRIAL_DAYS) : null;
    const trialDaysLeft = trialEndsAt ? Math.max(0, daysUntil(trialEndsAt, todayIso)) : 0;
    const inTrial = trialEndsAt ? daysUntil(trialEndsAt, todayIso) >= 0 : false;
    // Sans abonnement, l'école ne peut RIEN écrire et l'accès est fermé hors
    // écrans autorisés (abonnement / profil). Aligné avec school_is_writable
    // côté serveur, qui reste la source de vérité : ce calcul n'est qu'un
    // garde-fou UI, il ne doit jamais être considéré comme une autorisation.
    return { status: "AUCUN", subscription: null, plan: null, daysLeft: 0, readOnly: true, blocked: true, studentLimit: null, activeStudents, limitReached: false, inTrial, trialDaysLeft, trialEndsAt };
  }
  const plan = planById(subscription.plan);
  const studentLimit = subscription.studentLimit ?? plan.studentLimit;
  const daysLeft = daysUntil(subscription.endsAt, todayIso);
  const status: SubscriptionStatus = daysLeft < 0 ? "EXPIRE" : "ACTIF";
  return {
    status,
    subscription,
    plan,
    daysLeft,
    readOnly: daysLeft < 0 && -daysLeft <= READ_ONLY_DAYS,
    blocked: daysLeft < 0 && -daysLeft > READ_ONLY_DAYS,
    studentLimit,
    activeStudents,
    limitReached: studentLimit !== null && activeStudents >= studentLimit,
    inTrial: false,
    trialDaysLeft: 0,
    trialEndsAt: null,
  };
}

// Libellés affichés pour chaque statut d'abonnement.
export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  AUCUN: "Aucun abonnement",
  ACTIF: "Abonnement actif",
  EXPIRE_BIENTOT: "Abonnement bientôt expiré",
  EXPIRE: "Abonnement expiré",
};

// Calcule couleurs d'affichage selon le statut (suivant le même ordre que les libellés).
export const STATUS_TONES: Record<SubscriptionStatus, "success" | "warning" | "danger" | "neutral"> = {
  AUCUN: "neutral",
  ACTIF: "success",
  EXPIRE_BIENTOT: "warning",
  EXPIRE: "danger",
};