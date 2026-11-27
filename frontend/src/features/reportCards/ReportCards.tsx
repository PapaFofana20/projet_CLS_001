// Bulletins imprimables, selon le cycle (elementaire ou autre).

import type { ReactNode } from "react";
import type { ReportCardData } from "@/types";
import { SCHOOL_YEAR } from "@/data/school";
import { ageFrom, formatDate, formatNumber } from "@/utils/format";
import { councilAppreciation, primaryAppreciation } from "@/utils/grades";
import { todayIso } from "@/data/school";

interface Props {
  card: ReportCardData;
  schoolName: string;
  exam?: string;
}

const rankLabel = (r: number | null, n: number) => (r === null ? "—" : `${r}${r === 1 ? "er" : "e"} / ${n}`);
const num = (v: number | null) => (v === null ? "—" : formatNumber(v));

// En-tete officiel du bulletin, commun aux deux cycles.
function Header({ card, schoolName, title }: { card: ReportCardData; schoolName: string; title: string }) {
  return (
    <header className="border-b-2 border-forest pb-4 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">République du Sénégal · Un Peuple, Un But, Une Foi</p>
      <p className="mt-1 text-[10px] uppercase tracking-widest text-neutral-500">Ministère de l'Éducation nationale</p>
      <h2 className="mt-3 text-xl font-extrabold text-forest">{schoolName}</h2>
      <p className="mt-1 text-lg font-bold">{title}</p>
      <p className="text-sm text-neutral-600">
        {card.period.label} · Année scolaire {SCHOOL_YEAR}
      </p>
    </header>
  );
}

// Identite de l'eleve et de sa classe, avec un champ supplementaire selon le cycle.
function StudentBlock({ card, extra }: { card: ReportCardData; extra: ReactNode }) {
  const s = card.student;
  return (
    <dl className="mt-4 grid sm:grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-mist p-4 text-sm print:bg-transparent print:p-0 lg:grid-cols-3">
      <div><dt className="inline text-neutral-500">Élève : </dt><dd className="inline font-bold">{s.firstName} {s.lastName}</dd></div>
      <div><dt className="inline text-neutral-500">Matricule : </dt><dd className="inline font-semibold">{s.matricule}</dd></div>
      <div><dt className="inline text-neutral-500">Classe : </dt><dd className="inline font-bold">{card.classRoom.name}</dd></div>
      <div><dt className="inline text-neutral-500">Né(e) le : </dt><dd className="inline font-semibold">{s.birthDate ? `${formatDate(s.birthDate)} (${ageFrom(s.birthDate, todayIso())} ans)` : "Non renseigné"}</dd></div>
      <div><dt className="inline text-neutral-500">Effectif : </dt><dd className="inline font-semibold">{card.classSize} élèves</dd></div>
      {extra}
    </dl>
  );
}

// Emplacements pointilles pour les signatures en bas du bulletin.
function Signatures({ labels }: { labels: string[] }) {
  return (
    <div className="mt-8 grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-center text-xs text-neutral-600">
      {labels.map((l) => (
        <div key={l}>
          <p className="font-semibold">{l}</p>
          <div className="mt-2 h-16 rounded-lg border border-dashed border-neutral-300" />
        </div>
      ))}
    </div>
  );
}

// Bulletin elementaire : notes sur 10, sans coefficients.
export function ElementaryReport({ card, schoolName, exam }: Props) {
  const scale = 10;
  return (
    <article className="print-area rounded-2xl bg-white p-6 shadow-card sm:p-10" aria-label={`Bulletin de ${card.student.firstName} ${card.student.lastName}`}>
      <Header card={card} schoolName={schoolName} title="Bulletin de notes · Cycle élémentaire" />
      <StudentBlock card={card} extra={<div><dt className="inline text-neutral-500">Instituteur : </dt><dd className="inline font-semibold">{card.headTeacherName}</dd></div>} />
      {exam && <p className="mt-3 text-xs font-semibold text-forest">Classe d'examen : préparation au {exam}</p>}
      <table className="mt-5 w-full border-collapse text-sm">
        <caption className="sr-only">Notes par matière</caption>
        <thead>
          <tr className="bg-forest text-left text-xs uppercase text-white print:bg-neutral-200 print:text-black">
            <th className="px-3 py-2">Matière</th>
            <th className="px-3 py-2 text-center">Note de composition /{scale}</th>
            <th className="px-3 py-2 text-center">Rang</th>
            <th className="px-3 py-2">Appréciation</th>
          </tr>
        </thead>
        <tbody>
          {card.lines.map((l) => (
            <tr key={l.subjectId} className="border-b border-neutral-200">
              <td className="px-3 py-2 font-semibold">{l.subjectName}</td>
              <td className="px-3 py-2 text-center font-bold">{num(l.composition)}</td>
              <td className="px-3 py-2 text-center">{l.rank ?? "—"}</td>
              <td className="px-3 py-2">{l.appreciation}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-lime-soft p-3 print:border print:bg-transparent"><p className="text-xs text-neutral-600">Moyenne générale</p><p className="text-2xl font-extrabold text-forest">{num(card.generalAverage)} / {scale}</p></div>
        <div className="rounded-xl bg-lime-soft p-3 print:border print:bg-transparent"><p className="text-xs text-neutral-600">Rang</p><p className="text-2xl font-extrabold text-forest">{rankLabel(card.rank, card.classSize)}</p></div>
        <div className="rounded-xl bg-mist p-3 print:border print:bg-transparent"><p className="text-xs text-neutral-600">Moyenne de la classe</p><p className="text-xl font-bold">{num(card.classAverage)} / {scale}</p></div>
        <div className="rounded-xl bg-mist p-3 print:border print:bg-transparent"><p className="text-xs text-neutral-600">Conduite · Absences</p><p className="text-base font-bold">{card.meta ? `${card.meta.conduct || "—"} · ${card.meta.absences} h` : "Non renseigné"}</p></div>
      </div>
      <section className="mt-5 rounded-xl border border-neutral-200 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">Appréciation de l'instituteur</h3>
        <p className="mt-2 text-sm">{card.meta?.comment || primaryAppreciation(card.generalAverage, card.student.firstName)}</p>
      </section>
      <Signatures labels={["L'instituteur", "Le directeur", "Le parent"]} />
    </article>
  );
}

/** Bulletin moyen / secondaire : une ligne par matière, coefficients, rang, professeur, conseil de classe. */
export function SecondaryReport({ card, schoolName, exam }: Props) {
  const totalCoef = card.lines.filter((l) => l.average !== null).reduce((a, l) => a + l.coefficient, 0);
  const totalPts = card.lines.reduce((a, l) => a + (l.average ?? 0) * l.coefficient, 0);
  return (
    <article className="print-area rounded-2xl bg-white p-5 shadow-card sm:p-8" aria-label={`Bulletin de ${card.student.firstName} ${card.student.lastName}`}>
      <Header card={card} schoolName={schoolName} title={`Bulletin de notes · ${card.classRoom.cycle === "moyen" ? "Cycle moyen" : "Cycle secondaire"}`} />
      <StudentBlock card={card} extra={<div><dt className="inline text-neutral-500">Prof. principal : </dt><dd className="inline font-semibold">{card.headTeacherName}</dd></div>} />
      {exam && <p className="mt-3 text-xs font-semibold text-forest">Classe d'examen : préparation au {exam}</p>}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-xs">
          <caption className="sr-only">Notes par matière avec coefficients</caption>
          <thead>
            <tr className="bg-forest text-left uppercase text-white print:bg-neutral-200 print:text-black">
              <th className="px-2 py-2">Matière</th>
              <th className="px-2 py-2 text-center">Coef.</th>
              <th className="px-2 py-2 text-center">Devoirs</th>
              <th className="px-2 py-2 text-center">Compo.</th>
              <th className="px-2 py-2 text-center">Moy. /20</th>
              <th className="px-2 py-2 text-center">Moy × coef</th>
              <th className="px-2 py-2 text-center">Rang</th>
              <th className="px-2 py-2">Professeur</th>
              <th className="px-2 py-2">Appréciation</th>
            </tr>
          </thead>
          <tbody>
            {card.lines.map((l) => (
              <tr key={l.subjectId} className="border-b border-neutral-200">
                <td className="px-2 py-2 font-semibold">{l.subjectName}</td>
                <td className="px-2 py-2 text-center">{l.coefficient}</td>
                <td className="px-2 py-2 text-center">{num(l.devoir1)} · {num(l.devoir2)}<span className="block text-[10px] text-neutral-500">moy. {num(l.devoirsAvg)}</span></td>
                <td className="px-2 py-2 text-center">{num(l.composition)}</td>
                <td className="px-2 py-2 text-center text-sm font-bold">{num(l.average)}</td>
                <td className="px-2 py-2 text-center">{l.average === null ? "—" : formatNumber(l.average * l.coefficient)}</td>
                <td className="px-2 py-2 text-center">{l.rank ?? "—"}</td>
                <td className="px-2 py-2">{l.teacherName}</td>
                <td className="px-2 py-2">{l.appreciation}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-mist font-bold print:bg-transparent">
              <td className="px-2 py-2">Total</td>
              <td className="px-2 py-2 text-center">{totalCoef}</td>
              <td colSpan={3} />
              <td className="px-2 py-2 text-center">{formatNumber(totalPts)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-lime-soft p-3 print:border print:bg-transparent"><p className="text-xs text-neutral-600">Moyenne générale pondérée</p><p className="text-2xl font-extrabold text-forest">{num(card.generalAverage)} / 20</p></div>
        <div className="rounded-xl bg-lime-soft p-3 print:border print:bg-transparent"><p className="text-xs text-neutral-600">Rang</p><p className="text-2xl font-extrabold text-forest">{rankLabel(card.rank, card.classSize)}</p></div>
        <div className="rounded-xl bg-mist p-3 print:border print:bg-transparent"><p className="text-xs text-neutral-600">Moyenne de la classe</p><p className="text-xl font-bold">{num(card.classAverage)}</p></div>
        <div className="rounded-xl bg-mist p-3 print:border print:bg-transparent"><p className="text-xs text-neutral-600">Absences · Conduite</p><p className="text-base font-bold">{card.meta ? `${card.meta.absences} h · ${card.meta.conduct || "—"}` : "Non renseigné"}</p></div>
      </div>
      <section className="mt-5 rounded-xl border border-neutral-200 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500">Appréciation du conseil de classe</h3>
        <p className="mt-2 text-sm">{card.meta?.comment || councilAppreciation(card.generalAverage)}</p>
      </section>
      <Signatures labels={["Le professeur principal", "Le directeur", "Le parent"]} />
    </article>
  );
}
