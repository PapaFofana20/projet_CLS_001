// Menus de la console d'administration et rôles autorisés par page admin.
import type { AdminAgentRole } from "@/types";

export interface AdminNavItem {
  to: string;
  label: string;
  icon: string;
  section: string;
  /** Réservé au superadministrateur. */
  superAdminOnly?: boolean;
  /** Réservé aux admins et superadmins (pas agent_suivi). */
  adminOrSuper?: boolean;
}

const ADMIN_NAV: AdminNavItem[] = [
  { to: "/admin", label: "Tableau de bord", icon: "dashboard", section: "Pilotage" },
  { to: "/admin/ecoles", label: "Tous les établissements", icon: "school", section: "Établissements" },
  { to: "/admin/ecoles?status=ACTIF", label: "Écoles actives", icon: "check_circle", section: "Établissements" },
  { to: "/admin/ecoles?status=SUSPENDUE", label: "Écoles suspendues", icon: "block", section: "Établissements" },
  { to: "/admin/agents", label: "Agents administratifs", icon: "badge", section: "Utilisateurs et accès", superAdminOnly: true },
  { to: "/admin/abonnements", label: "Abonnements", icon: "workspace_premium", section: "Abonnements" },
  { to: "/admin/finances", label: "Finances", icon: "account_balance_wallet", section: "Finances", adminOrSuper: true },
  { to: "/admin/analyses", label: "Croissance des établissements", icon: "trending_up", section: "Analyses et statistiques" },
  { to: "/admin/supervision/audit", label: "Journal d'audit", icon: "history", section: "Supervision", adminOrSuper: true },
  { to: "/admin/supervision/securite", label: "Sécurité", icon: "security", section: "Supervision", adminOrSuper: true },
  { to: "/admin/parametres", label: "Paramètres généraux", icon: "settings", section: "Configuration" },
  { to: "/admin/timetables", label: "Emploi du temps", icon: "calendar_month", section: "Configuration" },
];

// Renvoie les liens admin visibles pour ce rôle d'agent.
export function adminNavFor(role: AdminAgentRole): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => {
    if (item.superAdminOnly && role !== "superadmin") return false;
    if (item.adminOrSuper && role === "agent_suivi") return false;
    return true;
  });
}

/**
 * Rôles autorisés par route admin. Miroir des restrictions serveur
 * (l'API re-vérifie toujours) — le client ne fait qu'éviter d'afficher
 * une page que le serveur refuserait.
 */
export const ADMIN_ROUTE_ROLES = {
  dashboard: ["superadmin", "admin", "agent_suivi"] as AdminAgentRole[],
  ecoles: ["superadmin", "admin", "agent_suivi"] as AdminAgentRole[],
  agents: ["superadmin"] as AdminAgentRole[],
  abonnements: ["superadmin", "admin", "agent_suivi"] as AdminAgentRole[],
  finances: ["superadmin", "admin"] as AdminAgentRole[],
  analyses: ["superadmin", "admin", "agent_suivi"] as AdminAgentRole[],
  audit: ["superadmin", "admin"] as AdminAgentRole[],
  securite: ["superadmin", "admin"] as AdminAgentRole[],
  parametres: ["superadmin", "admin", "agent_suivi"] as AdminAgentRole[],
};