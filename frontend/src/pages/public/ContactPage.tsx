// Page publique de contact avec le formulaire et les coordonnées.
import { Link } from "react-router-dom";
import { PageHero } from "@/components/layout/PageHero";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { CONTACT } from "@/data/landing";
import { pageHeroes } from "@/data/pageHeroes";
import { ContactForm } from "@/features/landing/ContactForm";
import { usePageMeta } from "@/hooks/usePageMeta";

const infos = [
  { label: "Téléphone", value: CONTACT.phone },
  { label: "E-mail", value: CONTACT.email },
  { label: "Adresse", value: CONTACT.address },
  { label: "Horaires", value: CONTACT.hours },
];

// Composant principal de la page.
export default function ContactPage() {
  usePageMeta({
    title: "Contactez Classora",
    description:
      "Une question sur Classora ? Écrivez-nous via le formulaire de contact : notre équipe basée à Dakar répond sous 24 heures.",
    path: "/contact",
  });
  return (
    <>
      <PageHero {...pageHeroes.contact} />
      <section className="mx-auto w-full max-w-[1280px] px-gutter pb-14 md:pb-16" aria-labelledby="contact-support-title">
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
              <h2
                id="contact-support-title"
                className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl"
              >
                Une équipe à votre écoute
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-neutral-600 md:text-lg">
                Une question sur Classora, la mise en place dans votre établissement ou les tarifs ?
                Notre support basé à Dakar vous répond en moins de 24 h, du lundi au vendredi, 8 h – 18 h.
              </p>
            </div>
            <img
              src="/images/contact-support.webp"
              alt="Assistante technique Classora portant un casque et tenant un ordinateur portable"
              width={1028}
              height={941}
              decoding="async"
              className="relative mx-auto mt-8 block h-72 w-auto sm:h-80 md:h-[340px] lg:h-[440px]"
            />
          </div>
        </Reveal>
      </section>
      <section className="mx-auto w-full max-w-[1280px] px-gutter pb-20" aria-labelledby="contact-more-title">
        <Reveal>
          <h2 id="contact-more-title" className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
            Avant de nous écrire
          </h2>
          <p className="mt-3 max-w-2xl text-neutral-600">
            Vous vous demandez combien coûte Classora pour votre établissement, ou ce que la plateforme
            change au quotidien pour la direction, les enseignants et les parents ? Ces pages détaillent
            chaque aspect du service.
          </p>
          <ul className="mt-5 flex flex-wrap gap-3">
            <li>
              <Link
                to="/tarifs"
                className="inline-flex min-h-11 items-center rounded-full bg-mist px-5 text-sm font-semibold text-forest transition hover:bg-lime-soft"
              >
                Voir les tarifs
              </Link>
            </li>
            <li>
              <Link
                to="/fonctionnalites"
                className="inline-flex min-h-11 items-center rounded-full bg-mist px-5 text-sm font-semibold text-forest transition hover:bg-lime-soft"
              >
                Découvrir les fonctionnalités
              </Link>
            </li>
            <li>
              <Link
                to="/ecoles"
                className="inline-flex min-h-11 items-center rounded-full bg-mist px-5 text-sm font-semibold text-forest transition hover:bg-lime-soft"
              >
                Classora pour les écoles
              </Link>
            </li>
          </ul>
        </Reveal>
      </section>
      <section className="mx-auto grid w-full max-w-[1280px] gap-8 px-gutter pb-20 lg:grid-cols-[1.4fr_1fr]">
        <Reveal>
          <h2 className="sr-only">Formulaire de contact</h2>
          <ContactForm />
        </Reveal>
        <Reveal delay={120}>
          <div className="space-y-4">
            <h2 className="sr-only">Coordonnées de Classora</h2>
            {infos.map((i) => (
              <div key={i.label} className="flex items-center gap-4 rounded-3xl bg-lime-soft p-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">{i.label}</p>
                  <p className="font-semibold text-forest">{i.value}</p>
                </div>
              </div>
            ))}
            <div className="relative grid h-48 place-items-center overflow-hidden rounded-3xl bg-forest text-white" role="img" aria-label="Carte de localisation, Dakar">
              <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(#c6f068_1.5px,transparent_1.5px)] [background-size:18px_18px]" />
              <div className="relative text-center">
                <Icon name="location_on" fill className="text-[44px] text-lime" />
                <p className="font-bold">Dakar, Sénégal</p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
