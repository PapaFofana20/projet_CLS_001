import type { Plan } from "@/types";
import { planMonthlyAmount, planYearlyAmount } from "@/utils/planPrice";

/**
 * Formules d'abonnement Classora — offres réelles publiées sur le site.
 *
 * Découverte : gratuit, 100 élèves.
 * Premium : 500 FCFA par élève et par mois, élèves illimités.
 * Groupe scolaire : sur devis (plusieurs établissements).
 *
 * La limite `studentLimit` borne le nombre d'élèves approuvés : au-delà,
 * la direction doit changer de formule (voir services/registrationService).
 */
export const plans: Plan[] = [
  {
    id: "essentiel",
    name: "Découverte",
    tagline: "Pour démarrer une école",
    studentLimit: 100,
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      "Jusqu'à 100 élèves",
      "Classes, notes et bulletins automatiques",
      "Espace parents",
      "Création d'accès du personnel",
      "Support par WhatsApp",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "La formule la plus choisie",
    studentLimit: null,
    monthlyPrice: 0,
    yearlyPrice: 0,
    pricePerStudent: 500,
    highlight: true,
    features: [
      "Élèves illimités",
      "Tous les modules du plan Découverte",
      "Paiements Wave / Orange Money / Free Money",
      "Affectations et emplois du temps",
      "Rappels automatiques des impayés",
      "Comptes économe, secrétaire et surveillant inclus",
      "Export des données et rapports",
      "Accompagnement dédié",
    ],
  },
  {
    id: "illimite",
    name: "Groupe scolaire",
    tagline: "Réseaux d'écoles",
    studentLimit: null,
    monthlyPrice: 0,
    yearlyPrice: 0,
    onQuote: true,
    features: [
      "Plusieurs établissements",
      "Tableau de bord consolidé",
      "Formation sur site",
      "Intégrations sur mesure",
      "Gestionnaire de compte dédié",
    ],
  },
];

// Retrouve une formule par son id, avec repli sur la formule découverte.
export const planById = (id: Plan["id"]): Plan => plans.find((p) => p.id === id) ?? plans[0];

// Prix de la formule selon le cycle et l'effectif (par élève pour Premium).
export const priceFor = (plan: Plan, cycle: "monthly" | "yearly", studentCount = 0): number =>
  cycle === "yearly" ? planYearlyAmount(plan, studentCount) : planMonthlyAmount(plan, studentCount);

// Libellé du plafond d'élèves d'une formule, pour les cartes tarifaires.
export const planLimitLabel = (plan: Plan): string => (plan.studentLimit === null ? "Élèves illimités" : `Jusqu'à ${plan.studentLimit} élèves`);
