// Choix du role a l'inscription (directeur, eleve ou parent).

import { Icon } from "@/components/ui/Icon";
import type { Role } from "@/types";
import { cn } from "@/utils/cn";

interface Option {
  role: Role;
  title: string;
  text: string;
  icon: string;
  hint?: string;
}

/** Les trois rôles qui peuvent s'inscrire seuls sur /inscription. */
export const SIGNUP_OPTIONS: Option[] = [
  { role: "directeur", title: "Je suis directeur d'école", text: "Créez votre école, abonnez-vous et recevez votre matricule.", icon: "admin_panel_settings", hint: "Licence annuelle, sans engagement" },
  { role: "eleve", title: "Je suis élève", text: "Inscrivez-vous avec le matricule reçu auprès de votre école.", icon: "backpack" },
  { role: "parent", title: "Je suis parent", text: "Rattachez vos élèves avec le matricule de l'école et leur matricule de l'élève.", icon: "family_restroom" },
];

// Cartes a cocher pour choisir entre directeur, eleve et parent.
export function RoleChoice({ value, onChange }: { value: Role | null; onChange: (role: Role) => void }) {
  return (
    <div className="grid gap-3" role="radiogroup" aria-label="Votre situation">
      {SIGNUP_OPTIONS.map((o) => {
        const active = value === o.role;
        return (
          <button
            key={o.role}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.role)}
            className={cn("flex items-start gap-4 rounded-2xl border-2 p-4 text-left transition-all duration-200", active ? "border-forest bg-lime-pale" : "border-neutral-200 hover:bg-lime hover:border-lime hover:text-ink")}
          >
            <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", active ? "bg-forest text-lime" : "bg-mist text-forest")}>
              <Icon name={o.icon} fill className="text-[24px] shrink-0 overflow-visible" />
            </span>
            <span className="min-w-0">
              <span className="block font-bold">{o.title}</span>
              <span className="block text-sm text-neutral-600">{o.text}</span>
              {o.hint && <span className="mt-1 inline-block rounded-full bg-lime-soft px-2.5 py-0.5 text-xs font-semibold text-forest">{o.hint}</span>}
            </span>
            {active && <Icon name="check_circle" fill className="ml-auto shrink-0 text-forest" />}
          </button>
        );
      })}
    </div>
  );
}