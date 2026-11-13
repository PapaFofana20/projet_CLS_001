// Bloc principal de la page d'accueil, avec carrousel d'images.

import { useEffect, useState } from "react";
import { Container } from "@/components/layout/Container";
import { ArrowButton } from "@/components/ui/ArrowButton";

import { heroSlides } from "@/data/landing";

const SLIDE_DURATION = 8000;

/**
 * Hero de l'accueil : carrousel d'images en arrière-plan (fondu enchaîné toutes
 * les 8 s), même contrat que PageHero — bloc arrondi dans le Container,
 * `var(--hero-top-gap)` sous le haut de page, navbar fixe chevauchée (aucune place
 * réservée dans le flux) et contenu repoussé à `var(--nav-clearance)`.
 */
export function Hero() {
  const [active, setActive] = useState(0);
  // Seules la diapositive visible et la suivante sont demandées au premier
  // rendu : l'accueil ne télécharge plus les six photos (≈ 1,1 Mo) d'un coup.
  const [prepared, setPrepared] = useState<number[]>(() => (heroSlides.length > 1 ? [0, 1] : [0]));

  useEffect(() => {
    const id = window.setTimeout(() => {
      setActive((current) => (current + 1) % heroSlides.length);
    }, SLIDE_DURATION);
    return () => window.clearTimeout(id);
  }, [active]);

  // Si l'utilisateur clique un point avant le préchargement, on demande
  // immédiatement l'image choisie.
  useEffect(() => {
    const next = (active + 1) % heroSlides.length;
    setPrepared((prev) => {
      const missing = [active, next].filter((index) => !prev.includes(index));
      return missing.length ? [...prev, ...missing] : prev;
    });
  }, [active]);

  // Toujours inclure la diapositive active, même avant l'exécution de l'effet :
  // aucun cadre vide pendant le fondu.
  const visible = prepared.includes(active) ? prepared : [...prepared, active];

  // Les autres photos sont préchargées une fois la page devenue interactive,
  // sans retarder le premier rendu ni les ressources critiques.
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      heroSlides.forEach((slide) => {
        const img = new Image();
        img.src = slide.src;
      });
    };
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(run, { timeout: 3500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }
    const timeoutId = window.setTimeout(run, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <section className="mt-hero-top mb-hero-bottom">
      <Container>
        <div className="relative flex min-h-[720px] flex-col justify-end overflow-hidden rounded-3xl bg-forest sm:min-h-[640px] lg:min-h-[540px]">
          {heroSlides.map((slide, index) => (
            <img
              key={slide.src}
              src={visible.includes(index) ? slide.src : undefined}
              alt={slide.alt}
              aria-hidden={index !== active}
              width={1600}
              height={900}
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "low"}
              decoding="async"
              className={`absolute inset-0 size-full object-cover object-center transition-opacity duration-500 ease-out ${
                index === active ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-forest via-forest/70 to-forest/30" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-r from-forest/80 via-transparent to-transparent" aria-hidden="true" />
          {/* Tiers supérieur densifié : lisibilité de la navbar sur toutes les photos. */}
          <div className="absolute inset-x-0 top-0 h-nav-clearance bg-gradient-to-b from-forest/85 via-forest/55 to-transparent" aria-hidden="true" />

          <div className="relative z-10 grid gap-8 px-6 pb-6 pt-nav-clearance sm:px-10 sm:pb-10 lg:px-14 lg:pb-14">
            <div className="max-w-3xl animate-fade-up">
              <h1 id="hero-title" className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Gérez votre école avec <span className="text-lime">sérénité</span>, du CI à la Terminale.
              </h1>
              <div className="mt-8 flex flex-wrap gap-3">
                <ArrowButton to="/fonctionnalites" tone="lime">
                  Voir les fonctionnalités
                </ArrowButton>
              </div>
            </div>
          </div>

          <div className="absolute bottom-10 right-10 z-10 hidden items-center gap-2 sm:flex lg:bottom-14 lg:right-14" role="tablist" aria-label="Images du carrousel">
            {heroSlides.map((slide, index) => (
              <button
                key={slide.src}
                type="button"
                role="tab"
                aria-label={`Image ${index + 1} sur ${heroSlides.length}`}
                aria-selected={index === active}
                onClick={() => setActive(index)}
                className={`h-1.5 rounded-full transition-[width,background-color] duration-300 ${
                  index === active ? "w-8 bg-lime" : "w-3 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
