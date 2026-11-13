// Page d'accueil publique du site Classora.
import { AboutSection } from "@/features/landing/AboutSection";
import { CtaSection } from "@/features/landing/CtaSection";
import { FaqSection } from "@/features/landing/FaqSection";
import { FeaturesCarousel } from "@/features/landing/FeaturesCarousel";
import { Hero } from "@/features/landing/Hero";
import { LogoStrip } from "@/features/landing/LogoStrip";

import { StepsBento } from "@/features/landing/StepsBento";
import { TestimonialsSection } from "@/features/landing/TestimonialsSection";
import { usePageMeta } from "@/hooks/usePageMeta";

// Composant principal de la page.
export default function HomePage() {
  usePageMeta({
    title: "Classora",
    description:
      "Classora digitalise votre école privée au Sénégal : inscriptions, bulletins automatiques et suivi des paiements, du CI à la Terminale.",
    path: "/",
  });
  return (
    <>
      <Hero />
      <LogoStrip />
      <AboutSection />
      <FeaturesCarousel />
      <StepsBento />
      <TestimonialsSection />
      <FaqSection />
      <CtaSection />
    </>
  );
}
