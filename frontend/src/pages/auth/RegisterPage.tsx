// Page d'inscription selon le rôle choisi (directeur, élève ou parent).
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Icon } from "@/components/ui/Icon";
import { RoleChoice } from "@/features/auth/RoleChoice";
import { formatMatriculeInput } from "@/utils/matricule";
import type { Role, School } from "@/types";

// Les formulaires ne sont chargés qu'au moment où l'utilisateur choisit son
// rôle : la page d'inscription s'affiche plus vite, sans parser les trois
// parcours à la fois. Ils sont préchargés pendant l'inactivité juste après.
const DirectorSignupForm = lazy(() =>
  import("@/features/auth/DirectorSignupForm").then((m) => ({ default: m.DirectorSignupForm })),
);
const StudentSignupForm = lazy(() =>
  import("@/features/auth/StudentSignupForm").then((m) => ({ default: m.StudentSignupForm })),
);
const ParentSignupForm = lazy(() =>
  import("@/features/auth/ParentSignupForm").then((m) => ({ default: m.ParentSignupForm })),
);
const MatriculeStep = lazy(() => import("@/features/auth/MatriculeStep").then((m) => ({ default: m.MatriculeStep })));
const PricingSection = lazy(() =>
  import("@/features/landing/PricingSection").then((m) => ({ default: m.PricingSection })),
);

/** Attente locale du formulaire : simple réserve de hauteur, sans saut de page. */
function FormLoading() {
  return (
    <div role="status" aria-label="Chargement du formulaire" className="space-y-3">
      <div className="h-11 animate-pulse rounded-xl bg-mist" />
      <div className="h-11 animate-pulse rounded-xl bg-mist" />
      <div className="h-11 animate-pulse rounded-xl bg-mist" />
      <div className="h-12 animate-pulse rounded-xl bg-mist" />
    </div>
  );
}

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

  // Choisir une formule remplace les cartes tarifaires par le formulaire de
  // création de compte. La position de défilement (au milieu des cartes) est
  // alors conservée : le formulaire n'apparaîtrait qu'en partie, coupé au
  // milieu ou en bas de l'écran. On remonte donc en haut de page pour que le
  // début du formulaire soit toujours visible. Même retour en arrière quand
  // l'utilisateur clique sur « Changer » pour revoir les formules.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [directorPlan]);

  // Précharge les formulaires pendant l'inactivité : au clic sur un rôle, le
  // formulaire est déjà en cache et s'affiche immédiatement.
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void import("@/features/auth/DirectorSignupForm");
      void import("@/features/auth/MatriculeStep");
      void import("@/features/auth/StudentSignupForm");
      void import("@/features/auth/ParentSignupForm");
      void import("@/features/landing/PricingSection");
    };
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(run, { timeout: 2500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }
    const timeoutId = window.setTimeout(run, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

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

        <Suspense fallback={<FormLoading />}>
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
        </Suspense>

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