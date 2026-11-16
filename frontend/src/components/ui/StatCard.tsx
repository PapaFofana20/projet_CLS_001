// Carte chiffrée du tableau de bord : icône, valeur et petit badge d'évolution.
import { cn } from "@/utils/cn";
import { Icon } from "./Icon";

interface Props {
  icon: string;
  label: string;
  value: string;
  note?: string;
  badge?: { text: string; tone: "up" | "down" | "neutral" };
  dark?: boolean;
}

/** Carte KPI du dashboard (carte foncée mise en avant + cartes blanches). */
export function StatCard({ icon, label, value, note, badge, dark }: Props) {
  return (
    <div className={cn("@container relative min-w-0 overflow-hidden rounded-2xl p-5 shadow-card", dark ? "bg-forest text-white" : "bg-white")}>
      <div className="pointer-events-none absolute -right-4 top-0 h-full w-1/2 opacity-30 [background-image:radial-gradient(currentColor_1.5px,transparent_1.5px)] [background-size:16px_16px]" aria-hidden="true" />
      <div className="relative flex items-start justify-between">
        <span className={cn("grid size-11 place-items-center rounded-xl", dark ? "bg-white text-forest" : "bg-neutral-200 text-forest")}>
          <Icon name={icon} fill />
        </span>
        {badge && (
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", badge.tone === "up" ? "bg-[#4cd90b] text-forest" : badge.tone === "down" ? "bg-red-600 text-white" : "bg-lime text-forest")}>{badge.text}</span>
        )}
      </div>
      <p className={cn("relative mt-4 text-sm font-medium", dark ? "text-white/80" : "text-neutral-600")}>{label}</p>
      {/* Taille fluide : les montants s'adaptent à la largeur réelle de la carte. */}
      <p className="overflow-wrap-anywhere relative mt-1 text-[clamp(1rem,7.5cqi,1.75rem)] font-extrabold leading-tight tracking-tight tabular-nums">{value}</p>
      {note && <p className={cn("relative mt-1 text-xs", dark ? "text-white/70" : "text-neutral-500")}>{note}</p>}
    </div>
  );
}
