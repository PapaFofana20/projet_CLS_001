// Écran post-inscription du directeur pour choisir et activer son abonnement.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/ui/Brand";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useAuth } from "@/context/AuthContext";
import { useSchool } from "@/context/SchoolContext";
import { useToast } from "@/context/ToastContext";
import { CYCLE_LABELS } from "@/data/school";
import { planLimitLabel, plans, priceFor } from "@/data/plans";
import { MatriculeCard } from "@/features/subscription/MatriculeCard";
import { PlanCard } from "@/features/subscription/PlanCard";
import { useAsync } from "@/hooks/useAsync";
import {
  latestSubscriptionRequest,
  refreshSchoolSubscription,
  requestSubscriptionActivation,
  type BillingCycle,
  type SubscriptionRequest,
} from "@/services/subscriptionService";
import type { Plan, PlanId } from "@/types";
import { cn } from "@/utils/cn";
import { formatCurrency, formatDate } from "@/utils/format";

const SUPPORT_EMAIL = "support@classora.com";
const MIN_STUDENTS = 50;
const MAX_STUDENTS = 1500;
const STEPS = ["Inscription", "Vérification", "Abonnement", "Matricule"];

function recommendPlan(count: number): Plan {
  return plans.find((plan) => plan.studentLimit === null || count <= plan.studentLimit) ?? plans[plans.length - 1];
}

function OnboardingSteps({ current }: { current: number }) {
  return (
    <ol className="flex gap-2" aria-label="Étapes de l'inscription">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-2 text-xs font-bold",
              active ? "bg-forest text-white" : done ? "bg-lime text-forest" : "bg-white text-neutral-500",
            )}
          >
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px]", active ? "bg-lime text-forest" : done ? "bg-white" : "bg-mist")}>
              {done ? <Icon name="check" className="text-[14px]" /> : index + 1}
            </span>
            <span className="truncate">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PriceChoice({ label, price, hint, selected, onClick }: { label: string; price: string; hint: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "@container min-w-0 rounded-2xl border-2 p-4 text-left transition-colors",
        selected ? "border-forest bg-lime-soft" : "border-neutral-200 bg-white hover:border-forest/40",
      )}
    >
      <span className="block text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="overflow-wrap-anywhere mt-1 block text-[clamp(1rem,7cqi,1.25rem)] font-extrabold leading-tight tabular-nums text-ink">{price}</span>
      <span className="mt-1 block text-xs text-neutral-500">{hint}</span>
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-mist p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-ink">{value}</dd>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)]">
      <Skeleton className="h-96 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-80 w-full rounded-3xl" />
        <Skeleton className="h-80 w-full rounded-3xl" />
        <Skeleton className="h-80 w-full rounded-3xl" />
        <Skeleton className="h-80 w-full rounded-3xl" />
      </div>
    </div>
  );
}

/** Écran post-inscription du directeur : choix de la formule, demande d'activation puis matricule. */
export default function DirectorSubscriptionPage() {
  const { user } = useAuth();
  const school = useSchool();
  const { toast } = useToast();
  const [studentCount, setStudentCount] = useState(300);
  const [planId, setPlanId] = useState<PlanId>("pro");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // On vérifie s'il existe déjà une demande d'abonnement en cours.
  const requestState = useAsync(async () => {
    if (!school.schoolId) return { request: null as SubscriptionRequest | null };
    return { request: await latestSubscriptionRequest(school.schoolId) };
  }, [school.schoolId]);
  const { setData: setRequestData } = requestState;

  const active = school.status === "ACTIF" || school.status === "EXPIRE_BIENTOT";
  const request = requestState.data?.request ?? null;
  const pending = !active && request?.status === "EN_ATTENTE";
  const recommended = recommendPlan(studentCount);
  const selectedPlan = plans.find((plan) => plan.id === planId) ?? recommended;
  const fits = selectedPlan.studentLimit === null || studentCount <= selectedPlan.studentLimit;
  const monthlyPrice = priceFor(selectedPlan, "monthly");
  const yearlyPrice = priceFor(selectedPlan, "yearly");
  const due = priceFor(selectedPlan, cycle);
  const cycles = school.school?.cycles ?? school.settings?.cycles ?? [];
  const schoolName = school.school?.name ?? school.settings?.name ?? school.schoolName ?? "Votre école";
  const city = school.school?.city ?? "";
  const cyclesLabel = cycles.map((c) => CYCLE_LABELS[c]).join(", ");
  const currentStep = active ? 3 : 2;
  const reload = school.reload;

  const checkActivation = useCallback(async () => {
    if (!school.schoolId) return;
    setChecking(true);
    setActionError(null);
    try {
      await refreshSchoolSubscription();
      reload();
      const latest = await latestSubscriptionRequest(school.schoolId);
      setRequestData({ request: latest });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Vérification impossible.");
    } finally {
      setChecking(false);
    }
  }, [school.schoolId, reload, setRequestData]);

  useEffect(() => {
    if (!pending || active || !school.schoolId) return;
    const timer = window.setInterval(() => {
      void refreshSchoolSubscription().then(reload).catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [pending, active, school.schoolId, reload]);

  if (!user) return null;

  const changeCount = (value: number) => {
    const next = Math.min(MAX_STUDENTS, Math.max(MIN_STUDENTS, value));
    setStudentCount(next);
    if (selectedPlan.studentLimit !== null && next > selectedPlan.studentLimit) {
      setPlanId(recommendPlan(next).id);
    }
  };

  const choosePlan = (plan: Plan) => {
    if (plan.studentLimit !== null && studentCount > plan.studentLimit) return;
    setPlanId(plan.id);
  };

  const submit = async () => {
    if (!fits || submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const created = await requestSubscriptionActivation({ planId: selectedPlan.id, cycle, studentCount });
      setRequestData({ request: created });
      toast("Demande d'activation envoyée au support.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Demande d'activation impossible.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-mist">
      <header className="border-b border-forest/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Logo />
          <Link to="/" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-forest hover:underline">
            <Icon name="arrow_back" className="text-[18px]" />
            Retour
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <OnboardingSteps current={currentStep} />

        <div className="mt-7">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-forest-500">Bonjour {user.firstName}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            {active ? "Votre école est activée" : pending ? "Votre demande est en cours" : "Choisissez l'abonnement de votre école"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600">
            {active
              ? "Votre matricule est prêt. Partagez-le aux élèves et aux parents pour ouvrir les inscriptions."
              : pending
                ? "Le support Classora traite votre demande. Cette page se met à jour automatiquement dès que l'abonnement est activé."
                : "Votre compte est créé. Indiquez votre effectif, choisissez une formule puis demandez son activation au support."}
          </p>
        </div>

        {school.loading ? (
          <LoadingState />
        ) : active ? (
          <div className="mt-8 space-y-5">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-lime text-forest">
                    <Icon name="verified_user" fill className="text-[30px]" />
                  </span>
                  <div>
                    <Badge tone="success">Abonnement actif</Badge>
                    <h2 className="mt-2 text-2xl font-extrabold text-ink">Votre école est prête.</h2>
                    <p className="mt-1 max-w-full sm:max-w-xl text-sm text-neutral-600">
                      Votre matricule est disponible ci-dessous. Il permet aux familles de retrouver votre école et de créer leur compte.
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl bg-mist px-4 py-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Formule</p>
                  <p className="font-bold text-forest">{school.plan?.name ?? selectedPlan.name}</p>
                  {school.endsAt && <p className="text-xs text-neutral-500">Jusqu'au {formatDate(school.endsAt)}</p>}
                </div>
              </div>
            </Card>

            {school.school?.matricule ? (
              <MatriculeCard school={school.school} canManage={false} onChanged={reload} />
            ) : (
              <Card className="text-center">
                <Icon name="key" className="text-[32px] text-forest" />
                <p className="mt-2 text-sm text-neutral-600">Le matricule sera généré automatiquement. Cliquez sur actualiser pour recharger.</p>
              </Card>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <LinkButton to="/app" variant="dark" size="lg" icon="dashboard">
                Accéder au tableau de bord
              </LinkButton>
              <Button variant="outline" size="lg" icon="refresh" loading={checking} onClick={() => void checkActivation()}>
                Actualiser
              </Button>
            </div>
          </div>
        ) : requestState.loading ? (
          <LoadingState />
        ) : requestState.error ? (
          <Card className="mt-8 text-center">
            <Icon name="error" className="text-[32px] text-danger" />
            <h2 className="mt-2 text-lg font-bold text-ink">Impossible de charger votre demande.</h2>
            <p className="mt-1 text-sm text-neutral-600">{requestState.error}</p>
            <Button className="mt-4" variant="outline" icon="refresh" onClick={requestState.reload}>
              Réessayer
            </Button>
          </Card>
        ) : pending && request ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Card className="text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-amber-100 text-amber-900">
                <Icon name="schedule" fill className="text-[32px]" />
              </span>
              <Badge tone="warning" className="mt-4">En attente d'activation</Badge>
              <h2 className="mt-3 text-2xl font-extrabold text-ink">Votre demande a bien été envoyée.</h2>
              <p className="mx-auto mt-2 max-w-full sm:max-w-xl text-sm text-neutral-600">
                Le support Classora confirme le paiement puis active votre abonnement. Vous n'avez rien d'autre à faire : cette page se met à jour automatiquement.
              </p>

              <dl className="mx-auto mt-6 grid max-w-full sm:max-w-xl gap-3 text-left sm:grid-cols-2">
                <SummaryRow label="Formule" value={plans.find((plan) => plan.id === request.planId)?.name ?? request.planId} />
                <SummaryRow label="Facturation" value={request.cycle === "yearly" ? "Annuelle" : "Mensuelle"} />
                <SummaryRow label="Effectif déclaré" value={`${request.studentCount} élèves`} />
                <SummaryRow label="Montant à régler" value={formatCurrency(request.amount)} />
              </dl>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button variant="dark" icon="refresh" loading={checking} onClick={() => void checkActivation()}>
                  Vérifier maintenant
                </Button>
              </div>

              {actionError && <p className="mt-3 text-sm font-medium text-danger">{actionError}</p>}

              <p className="mt-4 text-xs text-neutral-500">
                Une question ?{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-forest underline-offset-4 hover:underline">
                  {SUPPORT_EMAIL}
                </a>
              </p>
            </Card>

            <Card dark>
              <h3 className="text-lg font-bold">Ce qui se passe ensuite</h3>
              <ol className="mt-5 space-y-4 text-sm">
                {[
                  ["support_agent", "Le support vérifie votre demande et vous contacte pour le paiement."],
                  ["payments", "Vous réglez le montant de la formule choisie."],
                  ["verified_user", "Votre abonnement est activé et votre matricule apparaît ici."],
                ].map(([icon, text], index) => (
                  <li key={text} className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-lime">
                      <Icon name={icon} className="text-[20px]" />
                    </span>
                    <span className="text-white/85">
                      <span className="block text-xs font-bold uppercase tracking-wide text-lime">Étape {index + 1}</span>
                      {text}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 rounded-2xl bg-white/10 p-4 text-xs text-white/75">
                Votre école et votre compte restent enregistrés. La demande ne déclenche aucun prélèvement automatique.
              </p>
            </Card>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)]">
            <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <Card dark>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Votre école</p>
                <h2 className="mt-1 text-xl font-extrabold">{schoolName}</h2>
                <p className="mt-1 text-sm text-white/70">
                  {[city, cyclesLabel].filter(Boolean).join(" · ") || "Informations vérifiées"}
                </p>
                <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-lime">
                  <Icon name="verified_user" fill className="text-[18px]" />
                  Compte directeur et école vérifiés
                </p>
              </Card>

              <Card>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-ink">Votre effectif</h2>
                    <p className="mt-1 text-sm text-neutral-500">La formule recommandée s'adapte automatiquement.</p>
                  </div>
                  <p className="text-2xl font-extrabold text-forest">{studentCount}</p>
                </div>

                <label htmlFor="student-count" className="sr-only">
                  Nombre d'élèves
                </label>
                <input
                  id="student-count"
                  type="range"
                  min={MIN_STUDENTS}
                  max={MAX_STUDENTS}
                  step={10}
                  value={studentCount}
                  onChange={(event) => changeCount(Number(event.target.value))}
                  className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-forest"
                />
                <div className="mt-1 flex justify-between text-xs text-neutral-500">
                  <span>{MIN_STUDENTS} élèves</span>
                  <span>{MAX_STUDENTS} élèves</span>
                </div>

                <div className="mt-4 rounded-2xl bg-lime-soft p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-forest-500">Formule recommandée</p>
                  <p className="mt-1 text-lg font-extrabold text-forest">{recommended.name}</p>
                  <p className="text-sm text-forest-500">{planLimitLabel(recommended)}</p>
                </div>

                <div className="mt-5">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Facturation</p>
                  <Tabs
                    items={[
                      { id: "monthly", label: "Mensuel" },
                      { id: "yearly", label: "Annuel", badge: "-2 mois" },
                    ]}
                    value={cycle}
                    onChange={(id) => setCycle(id as BillingCycle)}
                    label="Cycle de facturation"
                  />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <PriceChoice
                    label="Par mois"
                    price={formatCurrency(monthlyPrice)}
                    hint={`Soit ${formatCurrency(monthlyPrice * 12)} par an`}
                    selected={cycle === "monthly"}
                    onClick={() => setCycle("monthly")}
                  />
                  <PriceChoice
                    label="Par an"
                    price={formatCurrency(yearlyPrice)}
                    hint={`Soit ${formatCurrency(Math.round(yearlyPrice / 12))} par mois`}
                    selected={cycle === "yearly"}
                    onClick={() => setCycle("yearly")}
                  />
                </div>

                <div className="mt-5 flex items-start gap-2 rounded-2xl bg-mist p-4 text-sm text-neutral-600">
                  <Icon name="payments" className="text-[20px] text-forest" />
                  <p>
                    Montant de la demande : <strong className="text-forest">{formatCurrency(due)}</strong>. Le support vous contacte pour le règlement, puis active l'abonnement.
                  </p>
                </div>

                {actionError && (
                  <div role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm font-medium text-danger">
                    <Icon name="error" className="text-[20px]" />
                    {actionError}
                  </div>
                )}

                <Button variant="dark" size="lg" icon="support_agent" className="mt-4 w-full" loading={submitting} disabled={!fits || submitting} onClick={() => void submit()}>
                  Demander l'activation
                </Button>
                <p className="mt-3 text-center text-xs text-neutral-500">Aucun prélèvement automatique : l'activation est faite par le support.</p>
              </Card>
            </div>

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-ink">Les formules</h2>
                <span className="text-sm text-neutral-500">
                  {studentCount} élèves · {cycle === "yearly" ? "annuel" : "mensuel"}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {plans.map((plan) => {
                  const compatible = plan.studentLimit === null || studentCount <= plan.studentLimit;
                  const selected = plan.id === selectedPlan.id;
                  return (
                    <div
                      key={plan.id}
                      className={cn(
                        "relative h-full rounded-3xl transition-transform",
                        compatible ? "hover:-translate-y-0.5" : "opacity-60",
                        selected && "ring-4 ring-lime ring-offset-2",
                      )}
                    >
                      <PlanCard plan={plan} cycle={cycle} />
                      <button
                        type="button"
                        aria-label={`Choisir la formule ${plan.name}`}
                        aria-pressed={selected}
                        disabled={!compatible}
                        onClick={() => choosePlan(plan)}
                        className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-offset-4"
                      />
                      {selected && (
                        <span className="pointer-events-none absolute right-4 top-4 z-20 grid size-8 place-items-center rounded-full bg-lime text-forest shadow-card">
                          <Icon name="check" className="text-[18px]" />
                        </span>
                      )}
                      {!compatible && (
                        <span className="pointer-events-none absolute inset-x-4 bottom-4 z-20 rounded-xl bg-white/95 px-3 py-2 text-center text-xs font-bold text-danger shadow-card">
                          Effectif supérieur à la limite
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="mt-3 text-xs text-neutral-500">
                La formule sélectionnée est celle utilisée pour votre demande. Le support confirme le montant avant l'activation.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
