// Contenus de la page d'accueil publique : images, fonctionnalités, avis et questions fréquentes.
const heroImg = "/images/hero.jpg";
const hero1Img = "/images/hero-1.jpg";
const hero2Img = "/images/hero-2.jpg";
const hero3Img = "/images/hero-3.jpg";
const hero4Img = "/images/hero-4.jpg";
const hero5Img = "/images/hero-5.jpg";
const hero6Img = "/images/hero-6.jpg";
const aboutImg = "/images/about-home.jpg";
const authImg = "/images/auth.jpg";
const authBackgroundImg = "/images/auth-background.svg";
const inscriptionsImg = "/images/feature-inscriptions.jpg";
const bulletinsImg = "/images/feature-bulletins.jpg";
const paiementsImg = "/images/feature-paiements.jpg";
const enseignantsImg = "/images/feature-enseignants.jpg";

export const images = { hero: heroImg, about: aboutImg, auth: authImg, authBackground: authBackgroundImg };

export interface HeroSlide {
  src: string;
  alt: string;
}

export const heroSlides: HeroSlide[] = [
  { src: hero1Img, alt: "Élève consultant son téléphone dans une salle de classe au Sénégal" },
  { src: hero2Img, alt: "Enseignante souriante devant son ordinateur dans une salle de classe" },
  { src: hero3Img, alt: "Deux membres de l'équipe Classora dans un couloir d'école" },
  { src: hero4Img, alt: "Quatre élèves travaillant sur des ordinateurs à la bibliothèque" },
  { src: hero5Img, alt: "L'équipe Classora serre la main d'un directeur d'école" },
  { src: hero6Img, alt: "Membre de l'équipe Classora devant une école sénégalaise" },
];

export const CONTACT = {
  phone: "+221 78 568 99 88",
  email: "contact@classora.sn",
  address: "Immeuble Teranga, Point E, Dakar, Sénégal",
  hours: "Du lundi au vendredi, 8 h – 18 h",
};

export const navLinks = [
  { to: "/", label: "Accueil" },
  { to: "/fonctionnalites", label: "Fonctionnalités" },
  { to: "/tarifs", label: "Tarifs" },
  { to: "/ecoles", label: "Écoles" },
  { to: "/a-propos", label: "À propos" },
  { to: "/contact", label: "Contact" },
];

export interface PartnerLogo {
  src: string;
  alt: string;
  /** Dimensions intrinsèques : réservent la place avant le chargement du SVG. */
  width: number;
  height: number;
}

export const partnerLogos: PartnerLogo[] = [
  { src: "/images/partners/partner-1.svg", alt: "Logo d'un partenaire de Classora", width: 182, height: 42 },
  { src: "/images/partners/partner-2.svg", alt: "Logo d'un partenaire de Classora", width: 441, height: 41 },
  { src: "/images/partners/partner-3.svg", alt: "Logo d'un partenaire de Classora", width: 317, height: 48 },
  { src: "/images/partners/partner-4.svg", alt: "Logo d'un partenaire de Classora", width: 253, height: 42 },
  { src: "/images/partners/partner-5.svg", alt: "Logo d'un partenaire de Classora", width: 215, height: 91 },
  { src: "/images/partners/partner-6.svg", alt: "Logo d'un partenaire de Classora", width: 252, height: 71 },
  { src: "/images/partners/partner-7.svg", alt: "Logo d'un partenaire de Classora", width: 407, height: 42 },
  { src: "/images/partners/partner-8.svg", alt: "Logo d'un partenaire de Classora", width: 288, height: 80 },
  { src: "/images/partners/partner-9.svg", alt: "Logo d'un partenaire de Classora", width: 432, height: 42 },
];

export interface Feature {
  id: string;
  title: string;
  description: string;
  image: string;
  bullets: string[];
}

export const features: Feature[] = [
  {
    id: "inscriptions",
    title: "Inscriptions simplifiées",
    description: "Dossier élève, parents, classe et frais en 3 étapes, avec réduction fratrie appliquée automatiquement.",
    image: inscriptionsImg,
    bullets: ["Inscription en 3 étapes", "Frais annexes : cantine, transport, tenue", "Réduction fratrie automatique", "Dossiers numériques sécurisés"],
  },
  {
    id: "bulletins",
    title: "Bulletins automatiques",
    description: "Moyennes, rangs et appréciations calculés pour l'élémentaire, le moyen et le secondaire, prêts à imprimer.",
    image: bulletinsImg,
    bullets: ["2 modèles : élémentaire et moyen/secondaire", "Coefficients par classe et série", "Rangs et appréciations automatiques", "Impression / PDF en un clic"],
  },
  {
    id: "paiements",
    title: "Paiements mobile money",
    description: "Les parents règlent les mensualités par Wave, Orange Money ou Free Money. Reçus et relances intégrés.",
    image: paiementsImg,
    bullets: ["Wave, Orange Money, Free Money", "Échéancier sur 10 mois", "Reçus instantanés", "Relances des impayés"],
  },
  {
    id: "enseignants",
    title: "Enseignants et affectations",
    description: "Matrice classes × matières, professeurs principaux, instituteurs titulaires et détection des conflits.",
    image: enseignantsImg,
    bullets: ["Matrice classes × matières", "Instituteur titulaire = toutes les matières", "Professeur principal", "Détection de conflits"],
  },
];

export const steps = [
  { id: 1, icon: "tune", title: "Configurez votre école.", text: "Choisissez vos cycles, vos périodes (semestres ou trimestres), vos matières et vos tarifs par niveau." },
  { id: 2, icon: "assignment_ind", title: "Affectez vos enseignants.", text: "Un instituteur titulaire par classe à l'élémentaire, des professeurs par matière au moyen et au secondaire." },
  { id: 3, icon: "edit_note", title: "Saisissez les notes.", text: "Chaque enseignant ne voit que ses classes. Moyennes, rangs et bulletins sont générés automatiquement." },
  { id: 4, icon: "savings", title: "Encaissez et communiquez.", text: "Les parents paient par mobile money, reçoivent leurs reçus, depuis un seul compte, même avec plusieurs élèves." },
];

export interface Plan {
  id: string;
  name: string;
  price: string;
  unit: string;
  description: string;
  highlight?: boolean;
  items: string[];
}

export const plans: Plan[] = [
  {
    id: "essentiel",
    name: "Plan découverte",
    price: "Gratuit",
    unit: "",
    description: "Pour démarrer une école — tout le nécessaire pour gérer les élèves, les notes et le personnel.",
    items: ["Jusqu'à 100 élèves", "Classes, notes et bulletins automatiques", "Espace parents", "Création d'accès du personnel (enseignants, économe, secrétaire, surveillant)", "Support par WhatsApp"],
  },
  {
    id: "premium",
    name: "Premium",
    price: "500 FCFA",
    unit: "par élève / mois",
    description: "Tous les modules Pro + comptes du personnel, export et accompagnement dédié.",
    highlight: true,
    items: ["Élèves illimités", "Tous les modules du plan Découverte", "Paiements Wave / Orange Money / Free Money", "Affectations et emplois du temps", "Rappels automatiques des impayés", "Comptes économe, secrétaire et surveillant inclus", "Export des données et rapports", "Accompagnement dédié"],
  },
  {
    id: "reseau",
    name: "Groupe scolaire",
    price: "Sur devis",
    unit: "multi-établissements",
    description: "Pour les réseaux d'écoles avec des besoins spécifiques.",
    items: ["Plusieurs établissements", "Tableau de bord consolidé", "Formation sur site", "Intégrations sur mesure", "Gestionnaire de compte dédié"],
  },
];

export interface Testimonial {
  id: string;
  quote: string;
  name: string;
  role: string;
  school: string;
  photo: string;
  photoAlt: string;
}

export const testimonials: Testimonial[] = [
  { id: "t1", quote: "Depuis Classora, nos bulletins sortent en une journée au lieu de deux semaines. Les parents paient par Wave sans se déplacer.", name: "Mme Aïssatou Diallo", role: "Directrice", school: "Complexe Scolaire Les Almadies, Dakar", photo: "/images/testimonials/aissatou-diallo.jpg", photoAlt: "Portrait de Mme Aïssatou Diallo, directrice du Complexe Scolaire Les Almadies" },
  { id: "t2", quote: "La matrice des affectations nous a évité des erreurs d'emploi du temps. Chaque professeur voit uniquement ses classes.", name: "Dr Mbaye Seck", role: "Directeur des études", school: "Institut Horizon, Thiès", photo: "/images/testimonials/mbaye-seck.jpg", photoAlt: "Portrait du Dr Mbaye Seck, directeur des études à l'Institut Horizon" },
  { id: "t3", quote: "Les impayés ont baissé de 35 % en un trimestre grâce aux relances et au paiement mobile money.", name: "Mme Mame Diarra Gaye", role: "Économe", school: "Groupe Les Baobabs, Mbour", photo: "/images/testimonials/mame-diarra-gaye.jpg", photoAlt: "Portrait de Mme Mame Diarra Gaye, économe du Groupe Les Baobabs" },
];

export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  { q: "Classora convient-il à mon école, quel que soit son niveau ?", a: "Oui. Classora couvre l'enseignement élémentaire, moyen et secondaire. Vous configurez vos cycles, vos classes et vos matières : un instituteur titulaire par classe à l'élémentaire, des professeurs par matière au moyen et au secondaire, avec les coefficients propres à chaque série. Les classes d'examen (CM2 pour le CFEE, 3ème pour le BFEM, Terminale pour le BAC) sont identifiées dès la configuration." },
  { q: "Comment se passe la mise en route de mon établissement ?", a: "Le directeur crée son école en quelques étapes guidées, puis configure ses cycles, ses périodes (semestres ou trimestres), ses matières et ses tarifs par niveau. Les élèves sont ensuite inscrits un par un ou en masse par import CSV (jusqu'à 500 élèves par fichier, avec vérification ligne par ligne), les enseignants sont affectés aux classes, et les comptes du personnel sont créés par la direction. Un tableau de bord de démarrage vous guide étape par étape." },
  { q: "Comment sont calculés les bulletins ?", a: "Les enseignants saisissent les devoirs et la composition dans leurs seules classes et matières. Les moyennes, les rangs et les appréciations sont ensuite calculés automatiquement, avec deux modèles de bulletin : un pour l'élémentaire, un pour le moyen et le secondaire. Conduite, absences et coefficients par série sont pris en compte, et les bulletins sont prêts à imprimer ou à exporter en PDF." },
  { q: "Classora aide-t-il à organiser les affectations, les emplois du temps et les absences ?", a: "Oui. La matrice classes × matières permet d'affecter chaque enseignant à ses classes, avec détection des conflits (double affectation, matière sans enseignant) et alertes de surcharge. Les emplois du temps sont créés par classe, puis publiés et consultables par les enseignants et les élèves concernés. Le surveillant saisit en parallèle les absences, les retards et les faits de discipline, qui alimentent la fiche de l'élève et les bulletins." },
  { q: "Comment fonctionne le suivi des paiements et les relances d'impayés ?", a: "Classora suit l'échéancier de chaque élève, les montants encaissés et les restes à payer, en temps réel. L'économe ou la direction enregistre les encaissements et génère les reçus ; les familles voient leurs échéances et leurs paiements depuis leur espace. Pour les impayés, des relances pré-remplies peuvent être envoyées aux parents par WhatsApp en un clic, et la réduction fratrie s'applique automatiquement dès le deuxième enfant." },
  { q: "Un parent avec plusieurs élèves a-t-il plusieurs comptes ?", a: "Non. Un seul compte parent permet de suivre tous ses enfants, même dans des cycles différents, grâce à un sélecteur d'élève. Le rattachement se fait avec le code enfant fourni par l'école, et la réduction fratrie est appliquée automatiquement sur la mensualité." },
  { q: "Combien coûte Classora et que se passe-t-il si mon abonnement expire ?", a: "Le plan Découverte est gratuit jusqu'à 100 élèves ; le plan Premium est facturé 500 FCFA par élève et par mois, sans frais d'installation ni engagement, avec un tarif qui s'ajuste à vos effectifs. Vous êtes alerté 7 jours avant l'échéance. Après l'échéance, l'école passe en lecture seule pendant 7 jours (consultation possible, modifications bloquées), puis l'accès est suspendu jusqu'au renouvellement." },
  { q: "Qui peut voir quelles données ? Comment mes données sont-elles protégées ?", a: "Chaque rôle ne voit que ce qui le concerne : un enseignant ne voit que ses classes et ses matières, le professeur principal consulte en plus l'ensemble de sa classe, et un parent ne suit que ses propres enfants. Les données de chaque école sont strictement isolées, les comptes désactivés ou en attente ne peuvent pas se connecter, un mot de passe temporaire doit être changé à la première connexion, et la session se ferme automatiquement après une période d'inactivité." },
];

export const schoolPartners = [
  { id: "sp1", name: "Complexe Scolaire Les Almadies", city: "Dakar", cycles: ["Élémentaire", "Moyen", "Secondaire"], students: 620 },
  { id: "sp2", name: "Institut Horizon", city: "Thiès", cycles: ["Moyen", "Secondaire"], students: 410 },
  { id: "sp3", name: "Groupe Les Baobabs", city: "Mbour", cycles: ["Élémentaire", "Moyen"], students: 340 },
  { id: "sp4", name: "Collège Kocc Barma", city: "Saint-Louis", cycles: ["Moyen"], students: 280 },
  { id: "sp5", name: "École Les Pédagogues", city: "Rufisque", cycles: ["Élémentaire"], students: 210 },
  { id: "sp6", name: "Lycée Teranga Excellence", city: "Kaolack", cycles: ["Secondaire"], students: 260 },
];

export const aboutValues = [
  { title: "Transparence", text: "Les familles suivent notes, absences et paiements en temps réel." },
  { title: "Confiance", text: "Chaque rôle n'accède qu'aux données qui le concernent." },
  { title: "Simplicité", text: "Une interface pensée pour les directeurs, enseignants et parents, sur mobile d'abord." },
  { title: "Ancrage local", text: "Conçu avec des écoles sénégalaises, pour le système éducatif sénégalais." },
];

export const aboutStats = [
  { value: "320+", label: "Élèves suivis" },
  { value: "12", label: "Écoles partenaires" },
  { value: "2,4M", label: "FCFA encaissés" },
];

export const footerColumns = [
  { title: "Produit", links: [{ to: "/fonctionnalites", label: "Fonctionnalités" }, { to: "/tarifs", label: "Tarifs" }, { to: "/ecoles", label: "Écoles partenaires" }] },
  { title: "Entreprise", links: [{ to: "/a-propos", label: "À propos" }, { to: "/contact", label: "Contact" }, { to: "/tarifs", label: "FAQ" }] },
  { title: "Accès", links: [{ to: "/connexion", label: "Se connecter" }, { to: "/inscription", label: "Créer un compte" }, { to: "/mot-de-passe-oublie", label: "Mot de passe oublié" }] },
  { title: "Légal", links: [{ to: "/cgu", label: "CGU" }, { to: "/confidentialite", label: "Politique de confidentialité" }] },
];
