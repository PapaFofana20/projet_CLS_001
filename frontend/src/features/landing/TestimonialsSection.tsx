// Temoignages de directeurs d'ecole partenaires.

import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { testimonials } from "@/data/landing";

// Trois temoignages avec photo, citation et fonction de la personne.
export function TestimonialsSection() {
  return (
    <section className="mx-auto w-full max-w-[1280px] px-gutter py-16" aria-labelledby="testi-title">
      <Reveal>
        <div className="mb-12 text-center">
          <h2 id="testi-title" className="mx-auto max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Ils ont simplifié leur quotidien
          </h2>
        </div>
      </Reveal>
      <div className="grid gap-5 md:grid-cols-3">
        {testimonials.map((t, i) => (
          <Reveal key={t.id} delay={i * 100}>
            <figure className="relative flex h-full flex-col overflow-hidden rounded-3xl border-2 border-forest/10 shadow-pop bg-lime text-forest">
              {/* Dégradé radial en arrière-plan, comme la section « 4 étapes » */}
              <div className="aspect-[4/5] w-full overflow-hidden bg-neutral-200 relative z-10">
                <img
                  src={t.photo}
                  alt={t.photoAlt}
                  width={800}
                  height={1000}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover object-center"
                />
              </div>
              <div className="relative z-10 flex flex-1 flex-col p-7">
                <Icon name="format_quote" fill className="text-[44px] text-forest" />
                <blockquote className="mt-3 flex-1 text-base leading-relaxed">« {t.quote} »</blockquote>
                <figcaption className="mt-6">
                  <p className="text-sm font-bold">{t.name}</p>
                  <p className="text-xs font-bold text-forest">
                    {t.role} · {t.school}
                  </p>
                </figcaption>
              </div>
            </figure>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
