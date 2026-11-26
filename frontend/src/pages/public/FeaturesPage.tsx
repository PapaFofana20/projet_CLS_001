// Page publique qui présente les fonctionnalités par rôle d'utilisateur.
import { PageHero } from "@/components/layout/PageHero";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { pageHeroes } from "@/data/pageHeroes";
import { roleFeatures } from "@/data/pages";
import { CtaSection } from "@/features/landing/CtaSection";
import { usePageMeta } from "@/hooks/usePageMeta";
import { cn } from "@/utils/cn";

// Composant principal de la page.
export default function FeaturesPage() {
  usePageMeta({
    title: "Fonctionnalités de Classora",
    description:
      "Inscriptions en ligne, bulletins automatiques et suivi des paiements : tout ce que Classora apporte à la direction, aux enseignants et aux parents.",
    path: "/fonctionnalites",
  });
  return (
    <>
      <PageHero {...pageHeroes.fonctionnalites} />

      {/* Même panneau que celui situé sous le hero de la page À propos. */}
      <section className="mx-auto w-full max-w-[1280px] px-gutter pb-14 md:pb-16" aria-labelledby="espaces-title">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-lime-pale px-6 pt-12 text-center sm:pt-14 md:pt-16">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-50 [background-image:radial-gradient(#c6f068_1.5px,transparent_1.5px)] [background-size:18px_18px]"
            />
            <div
              aria-hidden="true"
              className="absolute bottom-0 left-1/2 size-[420px] -translate-x-1/2 translate-y-1/3 rounded-full bg-lime/40 blur-2xl md:size-[560px]"
            />
            <div className="relative">
              <h2 id="espaces-title" className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl max-w-3xl mx-auto text-center">
                Un espace <span className="text-forest-500">adapté</span> à chacun.
              </h2>
              <div className="mt-8 max-w-3xl mx-auto space-y-4 text-lg leading-relaxed text-neutral-700 text-center sm:mt-10 md:mt-12">
                <p>
                  La direction, les enseignants, les élèves et les parents disposent chacun de leur propre espace, avec les outils et les
                  informations qui les concernent.
                </p>
              </div>
            </div>
            <img
              src="/images/features-dashboard.webp"
              alt="Tableau de bord Classora : effectifs, recouvrement, bulletins, présences et emploi du temps consultables selon son rôle"
              width={1600}
              height={900}
              loading="lazy"
              decoding="async"
              className="relative -mx-[30%] mt-8 block h-auto w-[160%] max-w-none sm:mx-auto sm:h-72 sm:w-auto md:h-[380px] lg:h-[520px]"
            />
          </div>
        </Reveal>
      </section>

      <section className="mx-auto w-full max-w-[1280px] px-gutter py-16" aria-label="Espaces par rôle">
        <div className="space-y-16 lg:space-y-20">
          {roleFeatures.map((r, i) => (
            <Reveal key={r.id}>
              <article className={cn("grid items-center gap-8 lg:grid-cols-2 lg:gap-16", i % 2 === 1 && "lg:[&>div:first-child]:order-2")}>
                <div className="rounded-3xl bg-lime p-2 shadow-pop">
                  <img
                    src={r.image}
                    alt={r.imageAlt}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/3] w-full rounded-[1.25rem] object-cover"
                  />
                </div>
                <div>
                  <h4 className="mb-4 text-xl font-extrabold tracking-tight sm:text-2xl">
                    {r.id === "directeur" ? "Pour le " : "Pour les "}
                    <span className="text-forest-500">{r.role}</span>.
                  </h4>
                  <h3 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{r.title}</h3>
                  <p className="mt-3 text-neutral-600">{r.description}</p>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {r.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm font-medium">
                        <Icon name="check_circle" fill className="mt-0.5 text-[20px] text-leaf shrink-0 overflow-visible" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <CtaSection />
    </>
  );
}
