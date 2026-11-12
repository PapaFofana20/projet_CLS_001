// Tableau de bord d'accueil, différent selon le rôle de l'utilisateur.
import { useCurrentUser } from "@/context/AuthContext";
import { AdminDashboard } from "@/features/dashboard/AdminDashboard";
import { ParentHome } from "@/features/dashboard/ParentHome";
import { SecretaireDashboard } from "@/features/dashboard/SecretaireDashboard";
import { StudentHome } from "@/features/dashboard/StudentHome";
import { SurveillantDashboard } from "@/features/dashboard/SurveillantDashboard";
import { TeacherHome } from "@/features/dashboard/TeacherHome";

/** /app : tableau de bord selon le rôle. */
export default function DashboardPage() {
  const user = useCurrentUser();
  switch (user.role) {
    case "directeur":
      return <AdminDashboard />;
    case "econome":
      return <AdminDashboard finance />;
    case "secretaire":
      return <SecretaireDashboard />;
    case "surveillant":
      return <SurveillantDashboard />;
    case "instituteur":
    case "professeur":
      return <TeacherHome />;
    case "eleve":
      return <StudentHome />;
    case "parent":
      return <ParentHome />;
    default:
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-lg font-semibold">Rôle non reconnu</p>
          <p className="text-sm text-neutral-500">
            Votre compte n&apos;a pas de rôle reconnu. Déconnectez-vous puis reconnectez-vous, ou contactez le support.
          </p>
        </div>
      );
  }
}