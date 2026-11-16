// Carte d'une formule d'abonnement, mensuelle ou annuelle.

import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { formatCurrency } from "@/utils/format";
import { planLimitLabel, priceFor } from "@/data/plans";
import { planPriceHint } from "@/utils/planPrice";
import type { Plan } from "@/types";
import { cn } from "@/utils/cn";

interface Props {
  plan: Plan;
  cycle: "monthly" | "yearly";
  /** Effectif retenu pour les formules facturées par élève. */
  studentCount?: number;
  current?: boolean;
}

/** Carte de formule (mensuel / annuel) — utilisée sur /app/abonnement. */
export function PlanCard({ plan, cycle, studentCount = 0, current }: Props) {
  const price = priceFor(plan, cycle, studentCount);
  return (
    <article
      className={cn(
        "@container relative flex h-full min-w-0 flex-col rounded-3xl border-2 p-6 transition-transform",
        plan.highlight ? "border-forest bg-forest text-white shadow-soft" : "border-neutral-200 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-extrabold">{plan.name}</h3>
          <p className={cn("text-sm", plan.highlight ? "text-white/70" : "text-neutral-500")}>{plan.tagline}</p>
        </div>
        {current && <Badge tone={plan.highlight ? "lime" : "dark"}>Formule actuelle</Badge>}
      </div>
      {/* Le prix reste lisible sans dépasser la carte, même en grille 4 colonnes. */}
      <p className="overflow-wrap-anywhere mt-6 text-[clamp(1.05rem,9cqi,1.75rem)] font-extrabold leading-tight tracking-tight tabular-nums">
        {plan.onQuote ? "Sur devis" : formatCurrency(price)}
      </p>
      <p className={cn("text-sm", plan.highlight ? "text-white/70" : "text-neutral-500")}>
        {plan.onQuote ? "selon le réseau" : cycle === "yearly" ? "par an" : "par mois"}
      </p>
      {plan.pricePerStudent ? (
        <p className={cn("text-xs", plan.highlight ? "text-white/70" : "text-neutral-500")}>
          {studentCount > 0
            ? `${formatCurrency(plan.pricePerStudent)} × ${studentCount} élève(s)`
            : `${formatCurrency(plan.pricePerStudent)} par élève et par mois`}
        </p>
      ) : null}
      <p className={cn("mt-2 inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-xs font-bold", plan.highlight ? "bg-white/10 text-white" : "bg-lime-soft text-forest")}>
        <Icon name="groups" className="text-[16px]" />
        {planLimitLabel(plan)}
      </p>
      <ul className="my-6 flex-1 space-y-2.5 text-sm">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Icon name="check_circle" fill className={cn("mt-0.5 shrink-0 text-[18px]", plan.highlight ? "text-lime" : "text-leaf")} />
            <span className={cn("overflow-wrap-anywhere break-words", plan.highlight ? "text-white/90" : "text-neutral-700")}>{f}</span>
          </li>
        ))}
      </ul>
      <p className={cn("text-xs font-medium", plan.highlight ? "text-white/70" : "text-neutral-500")}>
        {plan.onQuote ? planPriceHint(plan) : "Paiement par mobile bientôt disponible : contactez le support pour activer cette formule."}
      </p>
    </article>
  );
}
