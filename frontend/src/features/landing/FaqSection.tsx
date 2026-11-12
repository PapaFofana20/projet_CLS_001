// Questions frequentes de la page d'accueil, en accordéon.

import { useEffect } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { Reveal } from "@/components/ui/Reveal";
import { faqs } from "@/data/landing";

// Affiche les questions frequentes et les donnees liees pour le SEO.
export function FaqSection() {
  // Données structurées FAQPage : elles reprennent EXACTEMENT les questions
  // et réponses visibles de l'accordéon, sans contenu additionnel.
  useEffect(() => {
    const id = "faq-jsonld";
    let script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = id;
      script.type = "application/ld+json";
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
    return () => {
      script?.remove();
    };
  }, []);

  return (
    <section className="mx-auto w-full max-w-[1280px] px-gutter py-16" aria-labelledby="faq-title">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <h2 id="faq-title" className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Vos <span className="text-forest-500">questions</span>, nos réponses
          </h2>
          <p className="mt-4 text-neutral-600">Une autre question ? Écrivez-nous, nous répondons sous 24 heures.</p>
        </Reveal>
        <Reveal delay={100}>
          <Accordion items={faqs} />
        </Reveal>
      </div>
    </section>
  );
}
