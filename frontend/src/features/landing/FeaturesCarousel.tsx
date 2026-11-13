// Apercu des fonctionnalites, en cartes defilantes.

import { Link } from "react-router-dom";
import { Container } from "@/components/layout/Container";
import { Reveal } from "@/components/ui/Reveal";
import { features } from "@/data/landing";
const dashboardImg = "/images/features-dashboard.webp";

/** Carrousel horizontal de cartes image. */
export function FeaturesCarousel() {
  return (
    <section className="py-20" aria-labelledby="features-title">
      <Container>
        <Reveal>
          <h2 id="features-title" className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Tout ce qu'il faut pour <span className="text-forest-500">piloter</span> votre école.
          </h2>
          <div className="mt-10 -mx-gutter overflow-hidden sm:mx-auto sm:max-w-4xl">
            <img
              src={dashboardImg}
              alt="Tableau de bord Classora affiché sur un ordinateur portable"
              width={1672}
              height={941}
              loading="lazy"
              decoding="async"
              className="relative left-1/2 w-[125%] max-w-none -translate-x-1/2 sm:static sm:w-full sm:translate-x-0"
            />
          </div>
        </Reveal>
      </Container>
      <div
        className="no-scrollbar mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-gutter pb-4 lg:px-[max(var(--gutter),calc((100%-1280px)/2+var(--gutter)))]"
        tabIndex={0}
        aria-label="Liste des fonctionnalités"
      >
        {features.map((f) => (
          <Link key={f.id} to="/fonctionnalites" className="group relative aspect-[3/4] max-w-[280px] shrink-0 snap-start overflow-hidden rounded-3xl bg-forest sm:max-w-[320px]">
            <img src={f.image} alt={`Illustration : ${f.title}`} loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-110" />
            <div className="absolute inset-0 bg-gradient-to-t from-forest via-forest/50 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white">
              <h3 className="text-xl font-bold leading-snug">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/80">{f.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
