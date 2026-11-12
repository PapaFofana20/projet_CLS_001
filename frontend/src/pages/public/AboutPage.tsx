// Page publique de présentation de l'équipe et de la mission Classora.
import { PageHero } from "@/components/layout/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { pageHeroes } from "@/data/pageHeroes";
import { aboutValues, aboutStats } from "@/data/landing";
import { CtaSection } from "@/features/landing/CtaSection";
import { Counter } from "@/components/ui/Counter";
import { usePageMeta } from "@/hooks/usePageMeta";

// Composant principal de la page.
export default function AboutPage() {
  usePageMeta({
    title: "À propos",
    description:
      "L'équipe Classora et sa mission : outiller les écoles privées du Sénégal avec des outils simples, adaptés aux réalités locales, du CI à la Terminale.",
    path: "/a-propos",
  });
  return (
    <>
      <PageHero {...pageHeroes.apropos} />
      <section className="mx-auto w-full max-w-[1280px] px-gutter pb-14 md:pb-16" aria-labelledby="mission-title">
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
              <h2 id="mission-title" className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl max-w-3xl mx-auto text-center">
                <img src="/images/logo-dark.png" alt="Classora" width={240} height={46} className="inline-block h-[0.85em] w-auto align-[-0.1em]" /> : pensé pour les <span className="text-forest-500">réalités</span> de nos <span className="text-forest-500">écoles</span>.
              </h2>
              <div className="mt-8 max-w-3xl mx-auto space-y-4 text-lg leading-relaxed text-neutral-700 text-center sm:mt-10 md:mt-12">
                <p>
                  <strong className="text-ink">Tout est parti d'un constat simple :</strong> dans de nombreuses écoles privées sénégalaises, la gestion scolaire repose encore sur des piles de cahiers, des reçus papier et des bulletins laborieusement préparés à la main. Un fonctionnement chronophage qui complique le quotidien des équipes et freine l'efficacité des établissements.
                </p>
                <p>
                  <strong className="text-ink">Nous avons imaginé Classora pour changer cela.</strong> Une solution conçue autour de la réalité de nos écoles : un instituteur titulaire pour une classe à l'élémentaire, plusieurs professeurs au moyen et au secondaire, des coefficients adaptés à chaque série et un suivi des échéances de scolarité en temps réel.
                </p>
                <p>
                  Parce que gérer une école ne devrait pas être une succession de tâches administratives, mais un moyen de mieux accompagner chaque élève et de faire grandir son établissement.
                </p>
              </div>
            </div>
            <img
              src="/images/about-team.png"
              alt="L'équipe Classora : deux collaborateurs en polo vert Classora et un responsable, avec un ordinateur portable et une tablette"
              width={1672}
              height={941}
              decoding="async"
              className="relative -mx-[30%] mt-8 block h-auto w-[160%] max-w-none sm:mx-auto sm:h-72 sm:w-auto md:h-[380px] lg:h-[520px]"
            />
          </div>
        </Reveal>
      </section>

      <section className="mx-auto w-full max-w-[1280px] px-gutter py-20" aria-labelledby="values-title">
        <Reveal>
          <h2 id="values-title" className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
            Ce qui nous <span className="text-forest-500">guide</span>.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {aboutValues.map((v, i) => (
            <Reveal key={v.title} delay={i * 80}>
              <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border-2 border-forest/10 bg-lime p-6 text-forest shadow-pop transition-transform duration-300 hover:-translate-y-1">
                <div className="relative z-10">
                  <h3 className="text-lg font-bold">{v.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-700">{v.text}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1280px] px-gutter" aria-labelledby="vision-title">
        <div className="rounded-3xl bg-forest p-8 text-white sm:p-14 lg:p-16">
          <Reveal>
            <header className="lg:max-w-none">
              <h2 id="vision-title" className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl leading-tight">
                En <span className="text-lime">2030</span>, l'école mérite une gestion plus intelligente.
              </h2>
              <div className="mt-8 space-y-4 text-lg leading-relaxed text-white/85">
                <p>
                  D'ici 2030, nous imaginons des écoles privées sénégalaises qui consacrent <mark className="rounded bg-lime px-1 font-semibold text-forest">moins de temps à la complexité administrative</mark> et disposent d'<mark className="rounded bg-lime px-1 font-semibold text-forest">outils simples</mark> pour organiser leur quotidien, suivre leurs élèves et coordonner leurs équipes, avec Classora comme <mark className="rounded bg-lime px-1 font-semibold text-forest">système nerveux</mark> centralisant la <mark className="rounded bg-lime px-1 font-semibold text-forest">vie administrative, pédagogique et financière</mark> de l'établissement. Cette plateforme s'adapte à chaque cycle, de l'instituteur titulaire à l'élémentaire aux professeurs spécialisés au secondaire, sans imposer une standardisation excessive, mais en offrant un <mark className="rounded bg-lime px-1 font-semibold text-forest">socle commun fiable</mark> sur lequel chaque école construit sa propre organisation.
                </p>
                <p>
                  Elle transforme aussi la relation aux familles, grâce à des <mark className="rounded bg-lime px-1 font-semibold text-forest">paiements mobiles fluides et sécurisés</mark>, un <mark className="rounded bg-lime px-1 font-semibold text-forest">accès transparent aux bulletins et aux échéances</mark>, et une communication directe avec les enseignants, tout en équipant les directions de <mark className="rounded bg-lime px-1 font-semibold text-forest">tableaux de bord financiers en temps réel</mark>, d'alertes automatiques sur les impayés et de projections de trésorerie, pour faire de la gestion un <mark className="rounded bg-lime px-1 font-semibold text-forest">levier stratégique</mark> plutôt qu'une charge réactive.
                </p>
              </div>
            </header>
          </Reveal>

          <Reveal delay={200}>
            <blockquote className="mt-16 text-center">
              <p className="text-lg font-semibold text-white/90 italic">
                "<span className="text-lime">2030</span> n'est pas une ligne d'arrivée. C'est une vision qui nous pousse à aller toujours plus loin. Chaque évolution de Classora nous en rapproche."
              </p>
            </blockquote>
          </Reveal>

          <Reveal delay={300}>
            <div className="mt-12 grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {aboutStats.map((stat, i) => (
                <Reveal key={stat.label} delay={i * 100}>
                  <Counter value={stat.value} label={stat.label} delay={i * 200} />
                </Reveal>
              ))}
            </div>
          </Reveal>
        </div>
      </section>
      <CtaSection />
    </>
  );
}
