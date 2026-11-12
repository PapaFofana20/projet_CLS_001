// Références des images d'illustration des en-têtes de pages publiques.
const fonctionnalitesHeroImg = "/images/fonctionnalites-hero.webp";
const tarifsHeroImg = "/images/tarifs-hero.jpg";
const ecolesHeroImg = "/images/ecoles-hero.jpg";
const aproposHeroImg = "/images/apropos-hero.jpg";
const contactHeroImg = "/images/contact-hero.jpg";

/** Image d'illustration d'un hero de page publique. */
export interface PageHeroImage {
  src: string;
  alt: string;
  /** Recadrage CSS (object-position) pour que les 5 heroes ne se ressemblent pas. */
  objectPosition?: string;
  width: number;
  height: number;
}

export interface PageHeroCta {
  label: string;
  to: string;
}

export interface PageHeroData {
  title: string;
  description: string;
  primaryCta?: PageHeroCta;
  secondaryCta?: PageHeroCta;
  image: PageHeroImage;
}

/** Contenus des 5 heroes de pages publiques secondaires. */
export const pageHeroes: Record<"fonctionnalites" | "tarifs" | "ecoles" | "apropos" | "contact", PageHeroData> = {
  fonctionnalites: {
    title: "Tout ce qu'il faut pour gérer votre *école*",
    description: "Inscriptions, bulletins, paiements mobile money : un seul outil pour la direction, les enseignants et les parents.",
    primaryCta: { label: "Créer un compte", to: "/inscription" },
    secondaryCta: { label: "Voir les tarifs", to: "/tarifs" },
    image: { src: fonctionnalitesHeroImg, alt: "Enseignant travaillant sur un ordinateur portable dans une bibliothèque", objectPosition: "60% 30%", width: 2816, height: 1584 },
  },
  tarifs: {
    title: "Un tarif clair, calculé par *élève*",
    description: "Choisissez la formule adaptée à l'effectif de votre école. Paiement par Wave, Orange Money ou Free Money.",
    primaryCta: { label: "Créer un compte", to: "/inscription" },
    image: { src: tarifsHeroImg, alt: "Femme souriante consultant son téléphone devant une salle de classe", objectPosition: "60% 30%", width: 2816, height: 1584 },
  },
  ecoles: {
    title: "Une plateforme pensée pour les *écoles* privées du Sénégal",
    description: "Découvrez comment les établissements privés organisent leurs classes, leurs notes et leurs paiements avec Classora.",
    primaryCta: { label: "Créer un compte", to: "/inscription" },
    image: { src: ecolesHeroImg, alt: "Enseignante souriante devant sa classe d'élèves en uniforme", objectPosition: "60% 30%", width: 2816, height: 1584 },
  },
  apropos: {
    title: "Pensé pour nos *écoles*. Conçu pour aller plus loin.",
    description: "Nous construisons un outil adapté au système éducatif sénégalais, de l'élémentaire à la terminale.",
    primaryCta: { label: "Nous contacter", to: "/contact" },
    image: { src: aproposHeroImg, alt: "Trois membres de l'équipe Classora dans une salle de classe", objectPosition: "50% 30%", width: 2816, height: 1584 },
  },
  contact: {
    title: "Parlons de votre *école*.",
    description: "Une question, une démonstration ou un besoin spécifique ? Écrivez-nous, nous vous répondons rapidement.",
    image: { src: contactHeroImg, alt: "Quatre élèves sénégalais devant un ordinateur portable dans une bibliothèque", objectPosition: "50% 40%", width: 2816, height: 1584 },
  },
};