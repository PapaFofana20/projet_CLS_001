import { callFunction } from "@/lib/functions";
import type { PlatformStatus } from "@/types";

/**
 * État public de la plateforme (bandeau maintenance, inscriptions ouvertes,
 * délai de déconnexion admin). Repli local si l'API est injoignable : le site
 * public ne doit jamais être bloqué par cet appel.
 */
export const DEFAULT_PLATFORM_STATUS: PlatformStatus = {
  platformName: "Classora",
  supportEmail: "support@classora.sn",
  supportPhone: "",
  schoolYear: "2026-2027",
  registrationOpen: true,
  maintenanceMode: false,
  maintenanceMessage: "",
  sessionTimeoutMinutes: 60,
  migrationApplied: false,
};

// Récupère l'état public de la plateforme (avec valeur par défaut si l'API tombe).
// Le paramètre horodaté empêche tout cache intermédiaire de renvoyer un statut
// de maintenance périmé après une désactivation côté admin.
export async function getPlatformStatus(): Promise<PlatformStatus> {
  try {
    return await callFunction<PlatformStatus>(`platform-status?_=${Date.now()}`, undefined, "GET");
  } catch {
    return { ...DEFAULT_PLATFORM_STATUS };
  }
}
