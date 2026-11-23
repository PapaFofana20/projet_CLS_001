// Apercu des fonctionnalites, en cartes defilantes.

import { Container } from "@/components/layout/Container";
import { Reveal } from "@/components/ui/Reveal";
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
          <div className="mt-10 sm:mx-auto sm:max-w-4xl">
            <img
              src={dashboardImg}
              alt="Tableau de bord Classora affiché sur un ordinateur portable"
              width={1672}
              height={941}
              loading="lazy"
              decoding="async"
              className="w-full"
            />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
