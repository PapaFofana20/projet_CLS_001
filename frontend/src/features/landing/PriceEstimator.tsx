// Simulateur rapide du budget mensuel selon l'effectif.

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Reveal } from "@/components/ui/Reveal";
import { estimator } from "@/data/pages";
import { formatCurrency } from "@/utils/format";

/** Simulateur de budget mensuel selon l'effectif. */
export function PriceEstimator() {
  const [n, setN] = useState(estimator.defaultValue);
  return (
    <section className="mx-auto w-full max-w-4xl px-gutter pb-16" aria-labelledby="estimator-title">
      <Reveal>
        <Card className="!p-8 sm:!p-10">
          <h2 id="estimator-title" className="text-2xl font-extrabold">
            Estimez votre budget mensuel.
          </h2>
          <p className="mt-1 text-sm text-neutral-600">Formule Premium à {formatCurrency(estimator.pricePerStudent)} par élève et par mois.</p>
          <label htmlFor="effectif" className="mt-6 flex items-center justify-between text-sm font-semibold">
            <span>Effectif de votre école</span>
            <span className="font-bold text-forest">{n} élèves</span>
          </label>
          <input id="effectif" type="range" min={estimator.min} max={estimator.max} step={estimator.step} value={n} onChange={(e) => setN(Number(e.target.value))} className="mt-4 h-2 w-full cursor-pointer accent-forest" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-forest p-5 text-white">
              <p className="text-sm text-white/70">Par mois</p>
              <p className="text-3xl font-extrabold">{formatCurrency(n * estimator.pricePerStudent)}</p>
            </div>
            <div className="rounded-2xl bg-lime-soft p-5">
              <p className="text-sm text-neutral-600">Par année scolaire (10 mois)</p>
              <p className="text-3xl font-extrabold text-forest">{formatCurrency(n * estimator.pricePerStudent * 10)}</p>
            </div>
          </div>
        </Card>
      </Reveal>
    </section>
  );
}
