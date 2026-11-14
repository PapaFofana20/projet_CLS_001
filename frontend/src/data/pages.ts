// Textes du site public : rôles, fonctionnalités, frise d'histoire et simulateur de tarif.
export const roleHighlights = [
  { role: "Directeur", text: "Vue complète : effectifs, recouvrement, classes, enseignants, affectations et paramètres." },
  { role: "Économe", text: "Échéanciers, encaissements, relances, reçus et suivi des impayés." },
  { role: "Instituteur", text: "Toutes les matières de sa classe en onglets et bulletins." },
  { role: "Professeur", text: "Saisie limitée à ses couples classe · matière, plus la synthèse de sa classe principale." },
  { role: "Surveillant général", text: "Absences, retards et discipline suivis au quotidien." },
  { role: "Parent", text: "Un compte, plusieurs élèves, tous cycles confondus : notes, bulletins et paiements." },
];

export interface RoleFeature {
  id: string;
  /** Libellé affiché au-dessus du titre. */
  role: string;
  /** Nom de l'icône Material Symbols. */
  icon: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  bullets: string[];
}

const dashboardImg = "/images/role-directeur.webp"; // remplacé par scène classe (3 rôles)
const enseignantsImg = "/images/role-professeurs.webp"; // remplacé par image enseignant
const eleveImg = "/images/hero-1.webp"; // CONSERVÉ - image élève non remplacée
const parentsImg = "/images/role-parents.webp"; // remplacé par parent téléphone

/** Fonctionnalités détaillées, rôle par rôle, sur la page Fonctionnalités. */
export const roleFeatures: RoleFeature[] = [
  {
    id: "directeur",
    role: "Directeur",
    icon: "space_dashboard",
    title: "Tout piloter depuis un seul tableau de bord.",
    description:
      "Effectifs, recouvrement, classes, enseignants, affectations, emploi du temps et paramètres : la direction voit l'état de l'école en temps réel et agit sans changer d'outil.",
    image: dashboardImg,
    imageAlt: "Trois responsables de l'école réunis dans un bureau",
    bullets: [
      "Vue d'ensemble des effectifs et des encaissements",
      "Classes, personnel et affectations au même endroit",
      "Emploi du temps publié aux classes en un clic",
      "Bulletins et rapports exportables",
    ],
  },
  {
    id: "professeurs",
    role: "Professeurs",
    icon: "school",
    title: "Enseigner, noter et suivre ses classes.",
    description:
      "Chaque enseignant retrouve uniquement ses classes et ses matières. Il saisit les notes et consulte ses affectations, sans jamais sortir de son périmètre.",
    image: enseignantsImg,
    imageAlt: "Deux enseignants sénégalais échangeant dans une salle de classe",
    bullets: [
      "Accès limité à ses classes et à ses matières",
      "Saisie des notes par période et par coefficient",
      "Appréciations et synthèse de sa classe principale",
    ],
  },
  {
    id: "eleves",
    role: "Élèves",
    icon: "person",
    title: "Un espace personnel pour suivre sa scolarité.",
    description:
      "L'élève consulte ses notes, ses moyennes, son rang, ses absences et son emploi du temps publié. Il sait où il en est, à tout moment, depuis son téléphone.",
    image: eleveImg,
    imageAlt: "Élève consultant son emploi du temps sur son téléphone",
    bullets: [
      "Notes et moyennes par matière",
      "Rang et appréciations de chaque période",
      "Emploi du temps publié et absences",
      "Bulletins consultables et téléchargeables",
    ],
  },
  {
    id: "parents",
    role: "Parents",
    icon: "family_restroom",
    title: "Suivre ses enfants, payer et rester informé.",
    description:
      "Un seul compte pour tous les enfants, quel que soit le cycle. Les parents suivent les notes et règlent les échéances.",
    image: parentsImg,
    imageAlt: "Parent consultant ses paiements sur son téléphone",
    bullets: [
      "Plusieurs élèves rattachés à un même compte",
      "Notes, bulletins et absences en temps réel",
      "Paiement Wave, Orange Money ou Free Money",
      "Reçus et relances des impayés",
    ],
  },
];

export const subjectsContact = ["Demande de démonstration", "Tarifs et devis", "Support technique", "Partenariat", "Autre"];

export const timeline = [
  { 
    year: "2023", 
    title: "Le constat : l'école gérée sur papier.",
    text: "Dans une école privée de Dakar, la direction jongle chaque jour avec des cahiers de notes, des reçus manuscrits et des bulletins refaits à la main. Un fonctionnement qui mobilise l'équipe sur l'administratif au détriment du suivi pédagogique. C'est de ce terrain qu'est née l'idée : il faut un outil qui parle le langage des écoles sénégalaises." 
  },
  { 
    year: "2024", 
    title: "Imaginer une gestion adaptée à nos réalités.",
    text: "Un instituteur titulaire à l'élémentaire, plusieurs professeurs au moyen et au secondaire, des coefficients par série, un suivi de scolarité en temps réel : Classora se construit autour de ces réalités, pas à côté. Les premiers modèles de bulletins automatiques sont conçus avec des enseignants sénégalais pour coller au programme national." 
  },
  { 
    year: "2025", 
    title: "Le paiement, levier pour les familles.",
    text: "Wave, Orange Money et Free Money sont intégrés nativement. Les parents règlent les échéances depuis leur téléphone, l'école suit les encaissements en temps réel, l'économe gagne des heures chaque semaine. La gestion financière sort du papier." 
  },
  { 
    year: "2026", 
    title: "18 écoles, 2 000 élèves : l'étape symbolique.",
    text: "Pour l'année scolaire 2026-2027, 18 établissements privés ont fait le choix de Classora. Ce n'est pas une fin en soi, mais la preuve qu'un outil pensé pour le terrain sénégalais trouve sa place. La suite s'écrit chaque jour : alléger l'administratif pour que les équipes se concentrent sur l'essentiel — les élèves." 
  },
];

export const estimator = { min: 50, max: 1500, step: 10, defaultValue: 400, pricePerStudent: 500 };
