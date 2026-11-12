// Presentation de la prise en main en quatre etapes.

import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { steps } from "@/data/landing";
import { cn } from "@/utils/cn";

const tones = ["bg-lime text-forest", "bg-lime text-forest", "bg-lime text-forest"];
const features = ["Bulletins", "Échéancier"];

/** Grille bento « Comment ça marche » : la dernière carte, large, est en vert foncé. */
export function StepsBento() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-gutter pb-20" aria-labelledby="steps-title">
      <Reveal>
        <div className="mb-10 text-center">
          <h2 id="steps-title" className="mx-auto max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Opérationnel en 4 étapes
          </h2>
        </div>
      </Reveal>
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <Reveal key={s.id} delay={i * 90} className={last ? "md:col-span-3" : ""}>
              <article className={cn("group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl p-7 border-2 border-forest/10 shadow-pop", last ? "min-h-[260px] bg-lime text-forest md:flex-row md:items-center md:gap-10 md:p-10" : cn("min-h-[300px]", tones[i]))}>
                <div className={last ? "relative z-10 max-w-xl" : "relative z-10"}>
                  <div className="mb-8 flex items-center justify-between md:mb-6">
                    <span className="text-6xl font-extrabold tracking-tighter opacity-20">0{s.id}</span>
                  </div>
                  <h3 className="text-2xl font-bold">{s.title}</h3>
                  <p className={cn("mt-3 text-sm leading-relaxed", last ? "text-forest" : "text-neutral-700")}>{s.text}</p>
                </div>
                {last && (
                  <div className="relative z-10 mt-8 flex flex-wrap gap-3 md:mt-0 md:flex-col" aria-label="Inclus dans Classora">
                    {features.map((m) => (
                      <span key={m} className="inline-flex items-center gap-2 text-sm font-semibold text-forest/85">
                        <Icon name="check_circle" fill className="text-forest shrink-0 overflow-visible" />
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
