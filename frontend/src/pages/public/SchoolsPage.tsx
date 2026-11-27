// Page publique de présentation pour les écoles partenaires.
import { PageHero } from "@/components/layout/PageHero";
import { Counter } from "@/components/ui/Counter";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { pageHeroes } from "@/data/pageHeroes";
import { aboutStats, schoolPartners } from "@/data/landing";
import { CtaSection } from "@/features/landing/CtaSection";
import { TestimonialsSection } from "@/features/landing/TestimonialsSection";
import { usePageMeta } from "@/hooks/usePageMeta";

// Composant principal de la page.
export default function SchoolsPage() {
  usePageMeta({
    title: "Écoles partenaires au Sénégal",
    description:
      "Une plateforme pensée pour les écoles privées sénégalaises, de l'élémentaire au secondaire : inscriptions, vie scolaire et communication avec les familles.",
    path: "/ecoles",
  });
  return (
    <>
      <PageHero {...pageHeroes.ecoles} />
      <section className="mx-auto w-full max-w-[1280px] px-gutter pb-14 md:pb-16" aria-labelledby="schools-partners-title">
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
              <h2 id="schools-partners-title" className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
                Des <span className="text-forest-500">établissements</span> qui avancent <br className="hidden lg:inline" /> avec <img src="/images/logo-dark.webp" alt="Classora" width={240} height={52} className="inline-block h-[0.85em] w-auto align-[-0.1em]" />.
              </h2>
              <div className="mx-auto mt-8 max-w-3xl space-y-4 text-lg leading-relaxed text-neutral-700 sm:mt-10">
                <p>
                  Rejoindre Classora, c'est doter son établissement d'une infrastructure numérique pensée pour la réalité des écoles privées sénégalaises. Nous accompagnons chaque direction dans la mise en place d'un espace de travail unique — inscriptions, classes, notes, bulletins, présences et paiements — accessible à tous les acteurs de la communauté éducative, du bureau de la direction au téléphone d'un parent.
                </p>
                <p>
                  Ce partenariat dépasse la simple mise à disposition d'un outil : il repose sur une compréhension fine de l'organisation de chaque école. Classora respecte les spécificités de chaque cycle, des instituteurs titulaires de l'élémentaire aux professeurs spécialisés du secondaire, avec des coefficients adaptés aux séries et des données strictement isolées par établissement. <em className="font-semibold">Notre vision est de rendre la gestion scolaire assez transparente et fluide pour que chaque école puisse concentrer son énergie sur l'essentiel : la qualité de l'enseignement et la réussite de ses élèves.</em>
                </p>
              </div>
            </div>
            <img
              src="/images/ecoles-eleves.webp"
              alt="Quatre élèves en uniforme vert réunis autour d'un ordinateur portable et de leurs cahiers"
              width={1400}
              height={788}
              loading="lazy"
              decoding="async"
              className="relative -mx-[30%] mt-8 block h-auto w-[160%] max-w-none sm:mx-auto sm:h-72 sm:w-auto md:h-[380px] lg:h-[520px]"
            />
          </div>
        </Reveal>
      </section>
      <section className="mx-auto w-full max-w-[1280px] px-gutter pb-10" aria-label="Liste des écoles partenaires">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {schoolPartners.map((s, i) => (
            <Reveal key={s.id} delay={i * 60}>
              <article className="relative h-full rounded-3xl border-2 border-forest/10 shadow-pop bg-lime p-6 text-forest">
                <div className="relative z-10 flex items-center gap-4">
                  <div>
                    <h2 className="font-bold leading-snug text-forest">{s.name}</h2>
                    <p className="flex items-center gap-1 text-sm font-medium text-forest">
                      <Icon name="location_on" className="text-[16px]" />
                      {s.city}
                    </p>
                  </div>
                </div>
                <p className="relative z-10 mt-5 text-sm font-semibold text-forest">{s.cycles.join(" · ")}</p>
                <p className="relative z-10 mt-4 text-sm font-medium text-forest">
                  <strong className="text-forest">{s.students}</strong> élèves suivis
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>
      <section className="mx-auto w-full max-w-[1280px] px-gutter" aria-label="Chiffres clés">
        <div className="grid gap-4 rounded-3xl bg-forest p-6 text-center text-white sm:grid-cols-3 sm:p-10">
          {aboutStats.map((s, i) => (
            <Counter
              key={s.label}
              value={s.value}
              label={s.label}
              delay={i * 150}
              className="bg-transparent p-0 text-white"
              valueClassName="text-6xl text-lime"
              labelClassName="mt-0 text-sm text-white/80"
            />
          ))}
        </div>
      </section>
      <TestimonialsSection />
      <CtaSection />
    </>
  );
}
