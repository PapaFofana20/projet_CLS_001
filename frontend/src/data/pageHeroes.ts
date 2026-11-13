// Références des images d'illustration des en-têtes de pages publiques.
// Heroes servis en WebP redimensionné (1920 px de large) : ~60 à 120 Ko
// chacun au lieu de 300 à 1 500 Ko.
const fonctionnalitesHeroImg = "/images/fonctionnalites-hero.webp";
const tarifsHeroImg = "/images/tarifs-hero.webp";
const ecolesHeroImg = "/images/ecoles-hero.webp";
const aproposHeroImg = "/images/apropos-hero.webp";
const contactHeroImg = "/images/contact-hero.webp";

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
    title: "Tout ce qu'il faut pour gérer votre *école*.",
    description: "Inscriptions, notes, bulletins, paiements et emplois du temps. Un seul espace pour toute l'école.",
    primaryCta: { label: "Créer un compte", to: "/inscription" },
    secondaryCta: { label: "Voir les tarifs", to: "/tarifs" },
    image: { src: fonctionnalitesHeroImg, alt: "Enseignant travaillant sur un ordinateur portable dans une bibliothèque", objectPosition: "60% 30%", width: 2816, height: 1584 },
  },
  tarifs: {
    title: "Un tarif clair, calculé par *élève*.",
    description: "Plan Découverte gratuit, puis 500 FCFA par élève et par mois. Sans frais d'installation.",
    primaryCta: { label: "Créer un compte", to: "/inscription" },
    image: { src: tarifsHeroImg, alt: "Femme souriante consultant son téléphone devant une salle de classe", objectPosition: "60% 30%", width: 2816, height: 1584 },
  },
  ecoles: {
    title: "Une plateforme pensée pour les *écoles* privées du Sénégal.",
    description: "Pilotez classes, notes, bulletins et paiements. De l'élémentaire au secondaire.",
    primaryCta: { label: "Créer un compte", to: "/inscription" },
    image: { src: ecolesHeroImg, alt: "Enseignante souriante devant sa classe d'élèves en uniforme", objectPosition: "60% 30%", width: 2816, height: 1584 },
  },
  apropos: {
    title: "Pensé pour nos *écoles*. Conçu pour aller plus loin.",
    description: "Un outil pensé avec des écoles sénégalaises. Pour simplifier la gestion scolaire.",
    primaryCta: { label: "Nous contacter", to: "/contact" },
    image: { src: aproposHeroImg, alt: "Trois membres de l'équipe Classora dans une salle de classe", objectPosition: "50% 30%", width: 2816, height: 1584 },
  },
  contact: {
    title: "Parlons de votre *école*.",
    description: "Une question ou une démonstration ? Écrivez-nous, réponse sous 24 h.",
    image: { src: contactHeroImg, alt: "Quatre élèves sénégalais devant un ordinateur portable dans une bibliothèque", objectPosition: "50% 40%", width: 2816, height: 1584 },
  },
};