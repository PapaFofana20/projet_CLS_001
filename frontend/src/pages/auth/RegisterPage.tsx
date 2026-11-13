// Page d'inscription selon le rôle choisi (directeur, élève ou parent).
import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Icon } from "@/components/ui/Icon";
import { DirectorSignupForm } from "@/features/auth/DirectorSignupForm";
import { MatriculeStep } from "@/features/auth/MatriculeStep";
import { ParentSignupForm } from "@/features/auth/ParentSignupForm";
import { RoleChoice } from "@/features/auth/RoleChoice";
import { PricingSection } from "@/features/landing/PricingSection";
import { StudentSignupForm } from "@/features/auth/StudentSignupForm";
import { formatMatriculeInput } from "@/utils/matricule";
import type { Role, School } from "@/types";

/**
 * /inscription — trois parcours : directeur (direct), élève et parent (matricule d'abord).
 * Le lien partagé par l'école (?matricule=X7K9Q) pré-remplit le champ.
 * Le directeur s'inscrit sur le plan Découverte (gratuit), UN SEUL cycle : il
 * n'y a plus de choix de formule à l'inscription. Le parcours Premium (multi-
 * cycles, 600 élèves) a sa page dédiée : /inscription/premium — l'ancien lien
 * /inscription?plan=premium (page tarifs) y redirige.
 */
// Composant principal de la page.
export default function RegisterPage() {
  const [params] = useSearchParams();
  const [role, setRole] = useState<Role | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [directorPlan, setDirectorPlan] = useState<"decouverte" | "premium" | null>(null);

  // Ancien lien Premium de la page tarifs : redirige vers le formulaire dédié.
  if (params.get("plan") === "premium") return <Navigate to="/inscription/premium" replace />;

  const prefill = formatMatriculeInput(params.get("matricule") ?? "");
  const isParent = role === "parent";

  // Le sous-titre suit l'étape du parcours : la phrase « choisissez votre
  // situation » n'a de sens qu'au choix du rôle. Sur l'écran des tarifs elle
  // est supprimée, la consigne de choix de formule est déjà dans le contenu.
  const subtitle = !role
    ? "Directeur, élève ou parent : choisissez votre situation, l'inscription prend moins de 3 minutes."
    : role === "directeur"
      ? directorPlan === null
        ? undefined
        : "Renseignez les informations de votre école et de votre compte directeur."
      : isParent
        ? "Rattachez vos enfants à votre école avec le matricule reçu."
        : "Inscrivez-vous avec le matricule reçu auprès de votre école.";

  return (
    <AuthLayout
      title={role ? (role === "directeur" ? "Créer votre école" : isParent ? "Espace parent" : "Espace élève") : "Créer votre compte"}
      subtitle={subtitle}
      showVisual={false}
      wide={role === "directeur" && directorPlan === null}
      backgroundImage
    >
      <div className="space-y-5">
        {!role && <RoleChoice value={role} onChange={(r) => { setRole(r); setDirectorPlan(null); setSchool(null); }} />}

        {role === "directeur" && directorPlan === null && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">Choisissez la formule adaptée à votre école avant de créer votre compte.</p>
            <PricingSection withHeader={false} fullWidth showDescription={false} onSelectPlan={(id) => setDirectorPlan(id === "premium" ? "premium" : "decouverte")} />
            <button type="button" onClick={() => setRole(null)} className="text-sm font-semibold text-forest underline-offset-4 hover:underline">Retour au choix du rôle</button>
          </div>
        )}
        {role === "directeur" && directorPlan !== null && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-lime-soft p-4">
              <p className="text-sm font-semibold text-forest">Formule choisie : {directorPlan === "premium" ? "Premium" : "Découverte"}</p>
              <button type="button" onClick={() => setDirectorPlan(null)} className="text-sm font-semibold text-forest underline-offset-4 hover:underline">Changer</button>
            </div>
            <DirectorSignupForm variant={directorPlan === "premium" ? "premium" : "decouverte"} />
          </div>
        )}

        {(role === "eleve" || role === "parent") && !school && <MatriculeStep initial={prefill} onFound={setSchool} onBack={() => setRole(null)} />}

        {role === "eleve" && school && <StudentSignupForm school={school} onBack={() => setSchool(null)} />}
        {role === "parent" && school && <ParentSignupForm school={school} onBack={() => setSchool(null)} />}

        <p className="flex items-start gap-2 pt-2 text-xs text-neutral-500">
          <Icon name="info" className="text-[16px]" />
          Les comptes du personnel (enseignants, secrétaires, économes et surveillants) sont créés uniquement par la direction de l'école.
        </p>
        <p className="text-center text-sm text-neutral-600">
          Déjà inscrit ?{" "}
          <Link to="/connexion" className="font-bold text-forest underline-offset-4 hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}