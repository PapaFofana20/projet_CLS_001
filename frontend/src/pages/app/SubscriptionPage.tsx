// Page de lecture de l'abonnement actuel de l'école (directeur uniquement).
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { MatriculeCard } from "@/features/subscription/MatriculeCard";
import { useAuth } from "@/context/AuthContext";
import { useSchool } from "@/context/SchoolContext";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { getSchoolOverview } from "@/services/schoolService";
import { formatDate } from "@/utils/format";
import { STATUS_LABELS, STATUS_TONES } from "@/utils/subscription";

// Contact unique du site public (legal.ts / landing.ts) — l'ancienne adresse
// support@classora.com n'existait nulle part ailleurs.
const EMAIL_SUPPORT = "contact@classora.sn";

/** /app/abonnement — lecture seule : l'activation se fait côté support (l'achat en ligne est retiré pour l'instant). */
export default function SubscriptionPage() {
  const { schoolId } = useAuth();
  const school = useSchool();
  const { toast } = useToast();
  // On charge les infos de l'école pour afficher son matricule et son statut.
  const overview = useAsync(() => getSchoolOverview(schoolId), [schoolId]);

  const info = school.status;
  const currentPlanId = school.plan?.id;
  const active = info === "ACTIF" || info === "EXPIRE_BIENTOT";

  return (
    <>
      <PageHeader
        title="Abonnement Classora"
        subtitle="Visible uniquement par le directeur de l'école."
        actions={
          !active ? (
            <LinkButton to="/app/abonnement" icon="workspace_premium" variant="dark">
              Choisir une formule
            </LinkButton>
          ) : undefined
        }
      />

      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-neutral-600">{school.schoolName}</p>
              <p className="text-2xl font-extrabold">{school.settings?.name ?? "Votre école"}</p>
            </div>
            <Badge tone={STATUS_TONES[info]}>{STATUS_LABELS[info]}</Badge>
          </div>
          {school.settings && (
            <p className="mt-3 text-sm text-neutral-600">
              {info === "AUCUN"
                ? school.inTrial
                  ? `Essai gratuit de 14 jours — ${school.trialDaysLeft} jour(s) restant(s), fin le ${formatDate(school.trialEndsAt ?? undefined)}. Aucun paiement requis pendant les tests.`
                  : "Aucun abonnement actif pour le moment."
                : `Échéance le ${formatDate(school.endsAt ?? undefined)}`}
            </p>
          )}
          {school.studentLimit !== null && info !== "AUCUN" && (
            <p className="mt-1 text-sm text-neutral-600">
              Élèves actifs : <strong>{school.activeStudents}</strong> / {school.studentLimit}
              {school.limitReached && <Badge tone="danger" className="ml-2">Limite atteinte</Badge>}
            </p>
          )}
          {info === "AUCUN" && (
            <p className="mt-3 flex items-center gap-2 rounded-2xl bg-lime-soft p-4 text-sm font-medium text-forest">
              <Icon name="info" className="text-[20px]" />
              Le paiement en ligne est momentanément désactivé. Pour activer votre abonnement, contactez le support Classora : l'activation est effectuée manuellement.
            </p>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="relative bg-gradient-to-br from-forest to-forest-600 p-6 text-white sm:p-8">
            <div className="absolute -right-16 -top-16 size-48 rounded-full bg-lime/10" />
            <div className="absolute -bottom-20 -left-10 size-40 rounded-full bg-lime/5" />
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-lime/20 px-3 py-1 text-xs font-bold text-lime">
                    <Icon name="workspace_premium" className="text-[16px]" />
                    Abonnement actuel
                  </p>
                  <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">
                    {currentPlanId === "essentiel" || info === "AUCUN"
                      ? "Vous êtes sur la version gratuite"
                      : `Vous êtes sur ${school.plan?.name || "votre formule actuelle"}`}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">
                    {info === "AUCUN" || currentPlanId === "essentiel"
                      ? "Pour débloquer plus d'élèves, plus de fonctionnalités et profiter pleinement de Classora, passez au plan Premium."
                      : "Votre formule vous donne accès à l'ensemble des fonctionnalités de Classora."}
                  </p>
                </div>
                {(info === "AUCUN" || currentPlanId === "essentiel") && (
                  <Button
                    icon="workspace_premium"
                    variant="dark"
                    size="lg"
                    onClick={() => {
                      void navigator.clipboard.writeText(EMAIL_SUPPORT);
                      toast("Adresse du support copiée. Contactez-nous pour passer à Premium.");
                    }}
                    className="bg-lime text-forest hover:bg-lime/90"
                  >
                    Passer à Premium
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime-soft text-forest">
                <Icon name="groups" className="text-[22px]" />
              </span>
              <div>
                <p className="font-bold text-ink">Plus d'élèves</p>
                <p className="mt-1 text-sm text-neutral-600">Augmentez votre effectif autorisé et gérez davantage d'élèves sans contrainte.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime-soft text-forest">
                <Icon name="auto_awesome" className="text-[22px]" />
              </span>
              <div>
                <p className="font-bold text-ink">Accès complet</p>
                <p className="mt-1 text-sm text-neutral-600">Profitez de toutes les fonctionnalités avancées pour mieux gérer votre établissement.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime-soft text-forest">
                <Icon name="verified" className="text-[22px]" />
              </span>
              <div>
                <p className="font-bold text-ink">Support prioritaire</p>
                <p className="mt-1 text-sm text-neutral-600">Bénéficiez d'une assistance rapide pour vous accompagner au quotidien.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime-soft text-forest">
                <Icon name="trending_up" className="text-[22px]" />
              </span>
              <div>
                <p className="font-bold text-ink">Évolutif</p>
                <p className="mt-1 text-sm text-neutral-600">Un abonnement qui s'adapte aux besoins grandissants de votre école.</p>
              </div>
            </div>
          </div>
          {(info === "AUCUN" || currentPlanId === "essentiel") && (
            <div className="border-t border-neutral-100 bg-neutral-50/50 p-6 text-center sm:p-8">
              <p className="text-sm text-neutral-600">
                Pour souscrire au plan Premium, contactez notre équipe au{" "}
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(EMAIL_SUPPORT);
                    toast("Adresse du support copiée.");
                  }}
                  className="font-semibold text-forest underline-offset-2 hover:underline"
                >
                  {EMAIL_SUPPORT}
                </button>
              </p>
            </div>
          )}
        </Card>

        {!active && (
          <div className="flex justify-center">
            <Button
              icon="support_agent"
              onClick={() => {
                void navigator.clipboard.writeText(EMAIL_SUPPORT);
                toast("Adresse du support copiée.");
              }}
            >
              Copier l'adresse du support
            </Button>
          </div>
        )}

        {active && overview.data?.school && <MatriculeCard school={overview.data.school} canManage={false} onChanged={school.reload} />}
        {!active && overview.data?.school && (
          <div className="rounded-3xl border-2 border-dashed border-forest/30 bg-white p-6 text-center">
            <h2 className="text-xl font-extrabold text-forest">Votre matricule d'école</h2>
            <p className="mt-2 text-sm text-neutral-600">Il sera affiché ici après l'activation de votre abonnement, et servira aux élèves et parents pour créer leur compte.</p>
          </div>
        )}
      </div>
    </>
  );
}
