// Cartes tarifaires de la page d'accueil et de la page tarifs.

import { ArrowButton } from "@/components/ui/ArrowButton";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { plans } from "@/data/landing";
import { cn } from "@/utils/cn";

// Compare les trois formules et envoie vers l'inscription adaptee.
export function PricingSection({ withHeader = true, onSelectPlan, fullWidth = false }: { withHeader?: boolean; onSelectPlan?: (planId: string) => void; fullWidth?: boolean }) {
  // Sans en-tête (page /tarifs), le H2 #pricing-title n'est pas rendu : ne pas
  // référencer un identifiant absent (aria-labelledby cassé).
  return (
    <section className={cn("mx-auto w-full", fullWidth ? "max-w-full px-0" : "max-w-[1280px] px-gutter", withHeader ? "py-16" : "pt-8 pb-16")} aria-labelledby={withHeader ? "pricing-title" : undefined}>
      {withHeader && (
        <Reveal>
          <div className="mb-12 text-center">
            <h2 id="pricing-title" className="mx-auto max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Un prix simple, <span className="text-forest-500">par élève</span>.
            </h2>
            <p className="mx-auto mt-4 max-w-4xl text-neutral-600">Pas de frais d'installation ni d'engagement.<br className="hidden sm:block" /> Vous ne payez que pour vos élèves inscrits, toutes les fonctionnalités incluses dès le départ.</p>
          </div>
        </Reveal>
      )}
      <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
        {plans.map((p, i) => {
          const isGroup = p.id === "reseau";
          return (
            <Reveal key={p.id} delay={i * 100} className="h-full">
              <article className={cn("relative flex h-full min-h-[24rem] flex-col rounded-3xl p-8 transition-transform duration-300 hover:-translate-y-1", p.highlight ? "bg-forest text-white shadow-soft" : isGroup ? "bg-lime text-forest shadow-soft" : "bg-mist")}>
                <h3 className="text-lg font-bold">{p.name}</h3>
                <p className={cn("mt-1 text-sm", p.highlight ? "text-white/70" : isGroup ? "text-forest/70" : "text-neutral-600")}>{p.description}</p>
                <p className="mt-6 text-4xl font-extrabold tracking-tight">{p.price}</p>
                <p className={cn("text-sm", p.id === "premium" ? "text-base font-bold" : "", p.highlight ? "text-white/70" : isGroup ? "text-forest/70" : "text-neutral-500")}>{p.unit}</p>
                <ul className="my-7 flex-1 space-y-3 text-sm">
                  {p.items.map((it) => (
                    <li key={it} className="flex items-start gap-3">
                      <Icon name="check_circle" fill className={cn("mt-0.5 shrink-0 text-[20px]", p.highlight ? "text-lime" : isGroup ? "text-forest" : "text-leaf")} />
                      <span className="overflow-wrap-anywhere break-words">{it}</span>
                    </li>
                  ))}
                </ul>
                {onSelectPlan && !isGroup ? (
                  <Button type="button" variant={p.highlight ? "primary" : "outline"} className="w-full justify-between" onClick={() => onSelectPlan(p.id)}>
                    {isGroup ? "Demander un devis" : "Choisir " + p.name}
                  </Button>
                ) : (
                  <ArrowButton
                    to={
                      isGroup
                        ? "/contact"
                        : p.id === "premium"
                          ? "/inscription/premium"
                          : `/inscription?plan=${p.id}`
                    } tone={p.highlight ? "lime" : "forest"} className="w-full justify-between">
                    {isGroup ? "Demander un devis" : "Choisir " + p.name}
                  </ArrowButton>
                )}
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
