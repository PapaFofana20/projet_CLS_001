// Menus de navigation et droits d'accès par rôle, pour la sidebar et les gardes de route.
import type { Role } from "@/types";

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  section: string;
  /** Visible uniquement pour un enseignant principal / titulaire. */
  requiresHead?: boolean;
  /** Nombre affiché à droite du lien (demandes en attente). */
  badge?: number;
  /** Masqué lorsque l'école n'a pas d'abonnement actif (directeur). */
  requiresSubscription?: boolean;
  /** Réservé au directeur. */
  directorOnly?: boolean;
}

const dashboard = (label: string, icon = "dashboard"): NavItem => ({ to: "/app", label, icon, section: "Menu" });
const profile: NavItem = { to: "/app/parametres", label: "Mon profil", icon: "account_circle", section: "Outils" };
const subscription: NavItem = { to: "/app/abonnement", label: "Abonnement", icon: "workspace_premium", section: "École", directorOnly: true };

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  directeur: [
    dashboard("Tableau de bord"),
    { to: "/app/eleves", label: "Élèves", icon: "groups", section: "Menu" },
    { to: "/app/eleves/demandes", label: "Demandes d'inscription", icon: "how_to_reg", section: "Menu" },
    { to: "/app/inscription-eleve", label: "Inscription élève", icon: "person_add", section: "Menu" },
    { to: "/app/classes", label: "Classes", icon: "meeting_room", section: "École" },
    { to: "/app/enseignants", label: "Personnel", icon: "badge", section: "École" },
    { to: "/app/affectations", label: "Affectations", icon: "grid_view", section: "École" },
    { to: "/app/timetables", label: "Emploi du temps", icon: "calendar_month", section: "École" },
    subscription,
    { to: "/app/notes", label: "Notes", icon: "edit_note", section: "Scolarité" },
    { to: "/app/presences", label: "Présences", icon: "event_available", section: "Scolarité" },
    { to: "/app/bulletins", label: "Bulletins", icon: "description", section: "Scolarité" },
    { to: "/app/paiements", label: "Paiements", icon: "payments", section: "Finances" },
    { to: "/app/parametres", label: "Paramètres", icon: "settings", section: "Outils" },
  ],
  econome: [
    dashboard("Tableau de bord"),
    { to: "/app/eleves", label: "Élèves", icon: "groups", section: "Menu" },
    { to: "/app/paiements", label: "Paiements", icon: "payments", section: "Finances" },
    profile,
  ],
  secretaire: [
    dashboard("Secrétariat", "support_agent"),
    { to: "/app/eleves", label: "Élèves", icon: "groups", section: "Menu" },
    profile,
  ],
  surveillant: [
    dashboard("Vie scolaire", "shield_person"),
    { to: "/app/presences", label: "Présences", icon: "event_available", section: "Menu" },
    { to: "/app/eleves", label: "Élèves", icon: "groups", section: "Menu" },
    profile,
  ],
  instituteur: [
    dashboard("Ma classe", "child_care"),
    { to: "/app/eleves", label: "Mes élèves", icon: "groups", section: "Menu" },
    { to: "/app/presences", label: "Présences", icon: "event_available", section: "Scolarité" },
    { to: "/app/notes", label: "Notes", icon: "edit_note", section: "Scolarité" },
    { to: "/app/bulletins", label: "Bulletins", icon: "description", section: "Scolarité" },
    { to: "/app/timetables", label: "Emploi du temps", icon: "calendar_month", section: "Scolarité" },
    profile,
  ],
  professeur: [
    dashboard("Mes classes", "co_present"),
    { to: "/app/presences", label: "Présences", icon: "event_available", section: "Scolarité" },
    { to: "/app/notes", label: "Notes", icon: "edit_note", section: "Scolarité" },
    { to: "/app/eleves", label: "Mes élèves", icon: "groups", section: "Scolarité" },
    { to: "/app/bulletins", label: "Bulletins", icon: "description", section: "Scolarité", requiresHead: true },
    { to: "/app/timetables", label: "Emploi du temps", icon: "calendar_month", section: "Scolarité" },
    profile,
  ],
  eleve: [
    dashboard("Ma scolarité", "backpack"),
    { to: "/app/notes", label: "Mes notes", icon: "edit_note", section: "Scolarité" },
    { to: "/app/bulletins", label: "Bulletins", icon: "description", section: "Scolarité" },
    { to: "/app/timetables", label: "Emploi du temps", icon: "calendar_month", section: "Scolarité" },
    { to: "/app/paiements", label: "Mes paiements", icon: "payments", section: "Finances" },
    profile,
  ],
  parent: [
    dashboard("Suivi de mes élèves", "family_restroom"),
    { to: "/app/notes", label: "Notes", icon: "edit_note", section: "Scolarité" },
    { to: "/app/bulletins", label: "Bulletins", icon: "description", section: "Scolarité" },
    { to: "/app/timetables", label: "Emploi du temps", icon: "calendar_month", section: "Scolarité" },
    { to: "/app/paiements", label: "Paiements", icon: "payments", section: "Finances" },
    profile,
  ],
};

const ALL: Role[] = ["directeur", "econome", "secretaire", "surveillant", "instituteur", "professeur", "eleve", "parent"];

/** Rôles autorisés par route (utilisé par RoleRoute). */
export const ROUTE_ROLES = {
  eleves: ["directeur", "econome", "secretaire", "surveillant", "instituteur", "professeur", "parent"] as Role[],
  eleve: ["directeur", "econome", "secretaire", "surveillant", "instituteur", "professeur", "eleve", "parent"] as Role[],
  inscription: ["directeur"] as Role[],
  classes: ["directeur"] as Role[],
  enseignants: ["directeur"] as Role[],
  demandes: ["directeur"] as Role[],
  abonnement: ["directeur"] as Role[],
  onboarding: ["directeur"] as Role[],
  affectations: ["directeur"] as Role[],
  timetables: ALL,
  timetable_creation: ["directeur"] as Role[],
  notes: ["directeur", "instituteur", "professeur", "eleve", "parent"] as Role[],
  presences: ["directeur", "surveillant", "instituteur", "professeur"] as Role[],
  bulletins: ["directeur", "instituteur", "professeur", "eleve", "parent"] as Role[],
  paiements: ["directeur", "econome", "eleve", "parent"] as Role[],
  parametres: ALL,
};

export interface NavOptions {
  isHead?: boolean;
  /** École sans abonnement : le directeur ne voit que l'abonnement et son profil. */
  locked?: boolean;
  badges?: Record<string, number>;
}

/** Routes accessibles même sans abonnement actif (director sans abonnement, école expirée). */
export const ALWAYS_ALLOWED = ["/app/abonnement", "/app/parametres", "/app/mot-de-passe-temporaire"];

// Renvoie les liens de menu du rôle, filtrés selon ses responsabilités et ses badges.
export function navFor(role: Role, options: NavOptions = {}): NavItem[] {
  const { isHead = false, locked = false, badges = {} } = options;
  return NAV_BY_ROLE[role]
    .filter((i) => !i.requiresHead || isHead)
    .filter((i) => (locked && i.requiresSubscription ? false : true))
    .map((i) => {
      const badge = badges[i.to];
      return badge ? { ...i, badge } : i;
    });
}

// Vrai si la page reste accessible même sans abonnement actif.
export const isAlwaysAllowed = (pathname: string): boolean => ALWAYS_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));