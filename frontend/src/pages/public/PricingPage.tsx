// Page publique des tarifs et formules proposées aux écoles.
import { PageHero } from "@/components/layout/PageHero";
import { pageHeroes } from "@/data/pageHeroes";
import { CtaSection } from "@/features/landing/CtaSection";
import { FaqSection } from "@/features/landing/FaqSection";
import { PricingSection } from "@/features/landing/PricingSection";
import { Reveal } from "@/components/ui/Reveal";
import { usePageMeta } from "@/hooks/usePageMeta";

// Composant principal de la page.
export default function PricingPage() {
  usePageMeta({
    title: "Tarifs et offres scolaires",
    description:
      "Un tarif clair, calculé par élève : formules Essentiel et Premium avec estimateur en ligne. Découvrez le budget pour votre école privée.",
    path: "/tarifs",
  });
  return (
    <>
      <PageHero {...pageHeroes.tarifs} />
      <section className="mx-auto w-full max-w-[1280px] px-gutter pt-2 pb-8" aria-labelledby="pricing-intro">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="pricing-intro" className="text-3xl font-extrabold tracking-tight sm:text-5xl">
              Des tarifs <span className="text-forest-500">adaptés</span> à chaque école.
            </h2>
            <p className="mt-4 text-neutral-600">
              Choisissez le plan qui correspond à la taille de votre établissement. Chaque formule inclut l'inscription, la gestion des notes, les bulletins automatiques et le suivi des paiements — sans frais cachés.
            </p>
          </div>
        </Reveal>
      </section>
      <PricingSection withHeader={false} />
      <FaqSection />
      <CtaSection />
    </>
  );
}
