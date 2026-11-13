// Gabarit commun qui affiche un document légal (CGU ou confidentialité).
import { Link } from "react-router-dom";
import { Container } from "@/components/layout/Container";
import { PageHero } from "@/components/layout/PageHero";
import { Icon } from "@/components/ui/Icon";
import type { LegalDocument } from "@/data/legal";
import { usePageMeta } from "@/hooks/usePageMeta";
const cguHeroImg = "/images/hero-5.webp";
const privacyHeroImg = "/images/hero-3.webp";

const CONTACT_EMAIL = "contact@classora.sn";

const HERO_IMAGES = {
  cgu: {
    src: cguHeroImg,
    alt: "Équipe Classora échangeant avec un directeur d'école",
    width: 1920,
    height: 1080,
    objectPosition: "50% 35%",
  },
  confidentialite: {
    src: privacyHeroImg,
    alt: "Équipe Classora dans un couloir d'école",
    width: 1920,
    height: 1080,
    objectPosition: "50% 40%",
  },
};

/** Gabarit commun aux pages CGU et Politique de confidentialité. */
export function LegalPage({ doc }: { doc: LegalDocument }) {
  usePageMeta({
    title: doc.title,
    description: doc.slug === "cgu"
      ? "Conditions Générales d'Utilisation de Classora : règles d'accès, obligations des utilisateurs, tarifs, responsabilité et droit applicable."
      : "Politique de confidentialité de Classora : collecte, usage, protection et conservation des données personnelles des écoles et de leurs membres.",
    path: `/${doc.slug}`,
  });
  const other =
    doc.slug === "cgu"
      ? { to: "/confidentialite", label: "Politique de confidentialité" }
      : { to: "/cgu", label: "Conditions Générales d'Utilisation" };

  return (
    <>
      <PageHero
        eyebrow={doc.eyebrow}
        title={doc.title}
        description={doc.subtitle}
        meta={`Dernière mise à jour : ${doc.updatedAt}`}
        image={HERO_IMAGES[doc.slug]}
      />

      <section className="py-14">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[240px_1fr] lg:gap-16">
            <aside className="lg:sticky lg:top-[calc(var(--nav-clearance)+16px)] lg:self-start">
              <nav aria-label="Sommaire">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">Sommaire</p>
                <ol className="space-y-1.5 text-sm">
                  {doc.sections.map((s) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} className="inline-flex min-h-8 items-center text-neutral-600 transition-colors hover:text-forest hover:underline">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              <div className="mt-8 rounded-2xl bg-lime-soft p-4 text-sm">
                <p className="font-semibold text-forest">Voir aussi</p>
                <Link to={other.to} className="mt-1 inline-flex items-center gap-1 font-semibold text-forest underline underline-offset-2">
                  {other.label}
                  <Icon name="arrow_forward" className="text-[16px]" />
                </Link>
              </div>

              <a href={`mailto:${CONTACT_EMAIL}`} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-forest hover:underline">
                <Icon name="mail" className="text-[18px]" />
                Une question ? Écrivez-nous
              </a>
            </aside>

            <article className="max-w-3xl">
              <div className="rounded-2xl border border-neutral-200 bg-mist p-5 text-sm leading-relaxed text-neutral-700">
                {doc.intro.map((p, i) => (
                  <p key={i} className={i > 0 ? "mt-3" : ""}>
                    {p}
                  </p>
                ))}
              </div>

              <div className="mt-10 space-y-10">
                {doc.sections.map((s) => (
                  <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`}>
                    <h2 id={`${s.id}-title`} className="text-xl font-extrabold tracking-tight text-forest sm:text-2xl">
                      {s.title}
                    </h2>
                    {s.paragraphs?.map((p, i) => (
                      <p key={i} className="mt-3 text-sm leading-relaxed text-neutral-700 sm:text-base">
                        {p}
                      </p>
                    ))}
                    {s.items && (
                      <ul className="mt-3 space-y-2">
                        {s.items.map((it, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-neutral-700 sm:text-base">
                            <Icon name="check_circle" fill className="mt-0.5 shrink-0 text-[18px] text-leaf" />
                            <span>{it}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>

              <div className="mt-12 rounded-3xl bg-forest p-6 text-white sm:p-8">
                <p className="text-lg font-bold">Besoin d'une précision ?</p>
                <p className="mt-2 text-sm leading-relaxed text-white/80">
                  Écrivez-nous à{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-lime underline underline-offset-2">
                    {CONTACT_EMAIL}
                  </a>
                  . Nous répondons dans les meilleurs délais.
                </p>
              </div>
            </article>
          </div>
        </Container>
      </section>
    </>
  );
}
