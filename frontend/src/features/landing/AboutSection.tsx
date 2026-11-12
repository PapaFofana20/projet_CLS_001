// Section de presentation de Classora sur la page d'accueil.

import { Container } from "@/components/layout/Container";
import { ArrowButton } from "@/components/ui/ArrowButton";
import { Counter } from "@/components/ui/Counter";
import { Reveal } from "@/components/ui/Reveal";
import { aboutStats, images } from "@/data/landing";

/** Section sombre « À propos » (image arrondie + statistiques encadrées). */
export function AboutSection() {
  return (
    <section aria-labelledby="about-title">
      <Container>
        <div className="rounded-3xl bg-forest p-6 text-white sm:p-10 lg:p-14">
          <Reveal>
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
              <div>
                <h2 id="about-title" className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                  Le numérique au service de <span className="text-lime">nos écoles</span>
                </h2>
              </div>
              <div>
                <p className="text-base leading-relaxed text-white/85 sm:text-lg">
                  Classora est né d'un <span className="text-lime">constat simple</span> : dans de nombreuses écoles privées sénégalaises, la gestion repose encore sur des cahiers, des reçus papier et des <span className="text-lime">tâches administratives chronophages</span>. De cette réalité est née une <span className="text-lime">ambition</span> : concevoir une <span className="text-lime">plateforme qui simplifie</span> la gestion scolaire tout en <span className="text-lime">respectant les spécificités</span> de nos établissements, de l'élémentaire au secondaire. Aujourd'hui, Classora poursuit une <span className="text-lime">mission claire</span> : mettre le <span className="text-lime">numérique au service des écoles</span> pour une gestion <span className="text-lime">plus simple, plus efficace et mieux organisée</span>.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <ArrowButton to="/a-propos">Lire notre histoire</ArrowButton>
                  <ArrowButton to="/ecoles" tone="white">
                    Nos écoles partenaires
                  </ArrowButton>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_260px]">
              <div className="relative rounded-3xl bg-lime p-2 shadow-pop">
                <img src={images.about} alt="Équipe pédagogique d'une école partenaire" className="aspect-[16/10] w-full rounded-[1.25rem] object-cover" loading="lazy" />
              </div>
              <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3 rounded-3xl bg-lime p-2">
                {aboutStats.map((s, i) => (
                  <Counter
                    key={s.label}
                    value={s.value}
                    label={s.label}
                    delay={i * 150}
                    className="grid place-items-center rounded-2xl bg-white px-2 py-4 text-forest"
                    valueClassName="text-4xl sm:text-5xl"
                    labelClassName="mt-0 text-xs sm:text-sm"
                  />
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
