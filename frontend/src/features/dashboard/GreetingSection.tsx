// Section de bienvenue du tableau de bord : salutation selon l'heure,
// nom complet du compte, date du jour et petit rappel adapté au rôle.
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useCurrentUser } from "@/context/AuthContext";
import { useSchool } from "@/context/SchoolContext";
import { ROLE_LABELS } from "@/utils/permissions";

/** Salutation selon l'heure locale : Bonjour (journée) / Bonsoir (soirée et nuit). */
export function greetingOf(hour: number): string {
  if (hour >= 18 || hour < 5) return "Bonsoir";
  return "Bonjour";
}

const ROLE_HINTS: Record<string, string> = {
  directeur: "Voici l'état de votre école aujourd'hui — effectifs, paiements et résultats.",
  econome: "Suivez les encaissements et les échéances à relancer aujourd'hui.",
  secretaire: "Votre journée administrative en un coup d'œil.",
  surveillant: "Vie scolaire : absences, retards et incidents à suivre aujourd'hui.",
  instituteur: "Retrouvez vos classes, vos matières et vos notes à saisir.",
  professeur: "Retrouvez vos classes, vos matières et vos notes à saisir.",
  eleve: "Bonne journée d'école — retrouvez vos notes et vos prochaines échéances.",
  parent: "Suivez les résultats et les paiements de vos élèves en un coup d'œil.",
};

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Petite section moderne juste sous l'en-tête du tableau de bord. */
export function GreetingSection() {
  const user = useCurrentUser();
  const { schoolName, settings } = useSchool();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const fullName = `${user.firstName} ${user.lastName}`.trim() || "bienvenue";
  const dateLabel = capitalize(
    new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now),
  );
  const timeLabel = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(now);
  const dayNumber = new Intl.DateTimeFormat("fr-FR", { day: "numeric" }).format(now);
  const monthLabel = capitalize(new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(now));
  const weekdayLabel = capitalize(new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(now));
  const hint = ROLE_HINTS[user.role] ?? "Bienvenue sur votre espace.";

  return (
    <section
      aria-label="Bienvenue"
      className="relative mb-6 overflow-hidden rounded-3xl bg-forest text-white shadow-card"
    >
      {/* Décor discret, esprit SaaS */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-lime/20 blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/3 size-56 rounded-full bg-white/10 blur-3xl" />

      <div className="relative flex flex-wrap items-start gap-5 p-5 sm:p-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-lime">{ROLE_LABELS[user.role] ?? ""}</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {greetingOf(now.getHours())}, <span className="text-lime">{fullName || "bienvenue"}</span>
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/80">
            <Icon name="calendar_month" className="text-[18px] text-lime" />
            {dateLabel} · {timeLabel}
          </p>
          <p className="mt-2 max-w-xl text-sm text-white/75">{hint}</p>
          {(schoolName || settings?.schoolYear) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {schoolName && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                  <Icon name="school" className="text-[16px] text-lime" />
                  {schoolName}
                </span>
              )}
              {settings?.schoolYear && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                  <Icon name="event" className="text-[16px] text-lime" />
                  Année scolaire {settings.schoolYear}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="hidden shrink-0 flex-col items-center rounded-2xl bg-white/10 px-6 py-4 text-center ring-1 ring-white/10 sm:flex">
          <span className="text-4xl font-extrabold leading-none text-lime">{dayNumber}</span>
          <span className="mt-1 text-sm font-bold">{monthLabel}</span>
          <span className="text-xs text-white/70">{weekdayLabel}</span>
          <span className="mt-2 inline-flex items-center gap-1 border-t border-white/15 pt-2 text-xs font-semibold text-white/80">
            <Icon name="schedule" className="text-[16px]" />
            {timeLabel}
          </span>
        </div>
      </div>
    </section>
  );
}
