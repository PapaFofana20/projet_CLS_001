// Briques visuelles partagées par les pages de la console admin.
// Elles reprennent le langage de la page « Gestion des établissements » :
// carte forêt, tuiles KPI colorées, en-têtes de panneau et bandeaux.
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/utils/cn";

/* ------------------------------------------------------------------ */
/* Tuiles KPI colorées                                                */
/* ------------------------------------------------------------------ */

export type KpiTone = "lime" | "red" | "sky" | "amber" | "violet" | "neutral";

const KPI_TONES: Record<KpiTone, { box: string; chip: string }> = {
  lime: { box: "bg-lime-soft text-forest", chip: "bg-white/70 text-forest" },
  red: { box: "bg-red-50 text-red-900", chip: "bg-white text-danger" },
  sky: { box: "bg-sky-50 text-sky-950", chip: "bg-white text-sky-700" },
  amber: { box: "bg-amber-50 text-amber-950", chip: "bg-white text-amber-700" },
  violet: { box: "bg-violet-50 text-violet-950", chip: "bg-white text-violet-700" },
  neutral: { box: "bg-mist text-ink", chip: "bg-white text-forest" },
};

interface KpiTileProps {
  icon: string;
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: KpiTone;
  /** Permet de réduire la taille pour les montants longs (FCFA). */
  valueClassName?: string;
}

/** Petite carte chiffrée colorée, utilisée en complément du bandeau forêt. */
export function KpiTile({ icon, label, value, note, tone = "lime", valueClassName }: KpiTileProps) {
  const palette = KPI_TONES[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl p-4 shadow-card transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-soft",
        palette.box,
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", palette.chip)}>
          <Icon name={icon} fill className="text-[18px]" />
        </span>
        <p className="text-[11px] font-bold uppercase tracking-wide opacity-75">{label}</p>
      </div>
      <p className={cn("mt-3 text-2xl font-extrabold leading-none tabular-nums", valueClassName)}>{value}</p>
      {note && <p className="mt-1 text-xs opacity-70">{note}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bandeau forêt                                                      */
/* ------------------------------------------------------------------ */

interface HeroCardProps {
  eyebrow: string;
  icon: string;
  value: ReactNode;
  label: ReactNode;
  footnote?: ReactNode;
  children?: ReactNode;
  badge?: ReactNode;
  valueClassName?: string;
}

/** Carte vert forêt avec trame de points et halo lime. */
export function HeroCard({ eyebrow, icon, value, label, footnote, children, badge, valueClassName }: HeroCardProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-forest p-6 text-white shadow-soft">
      <div
        className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(currentColor_1.4px,transparent_1.4px)] [background-size:18px_18px]"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-lime/25 blur-3xl" aria-hidden="true" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-lime">{eyebrow}</p>
            {badge}
          </div>
          <p className={cn("mt-3 text-4xl font-extrabold leading-none tabular-nums sm:text-5xl", valueClassName)}>{value}</p>
          <p className="mt-2 text-sm text-white/70">{label}</p>
        </div>
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-lime">
          <Icon name={icon} fill className="text-[26px]" />
        </span>
      </div>

      {children && <div className="relative mt-6">{children}</div>}
      {footnote && <p className="relative mt-4 text-[11px] font-medium text-white/45">{footnote}</p>}
    </div>
  );
}

/** Barre de répartition empilée, blanche translucide sur le fond forêt. */
export function HeroBar({ segments }: { segments: Array<{ pct: number; className: string }> }) {
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
      {segments.map((segment, index) => (
        <span
          key={index}
          className={cn("h-full rounded-full transition-[width] duration-500", segment.className)}
          style={{ width: `${Math.max(0, Math.min(100, segment.pct))}%` }}
        />
      ))}
    </div>
  );
}

/** Légende alignée sous la barre de répartition. */
export function HeroLegend({
  items,
  trailing,
}: {
  items: Array<{ dot: string; label: ReactNode }>;
  trailing?: ReactNode;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-white/75">
      {items.map((item, index) => (
        <span key={index} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", item.dot)} />
          {item.label}
        </span>
      ))}
      {trailing && <span className="ml-auto inline-flex items-center gap-1.5 text-lime">{trailing}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* En-tête de panneau                                                 */
/* ------------------------------------------------------------------ */

interface PanelHeadingProps {
  icon: string;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Titre de carte avec pastille d'icône lime, sous-titre et action à droite. */
export function PanelHeading({ icon, title, subtitle, action, className }: PanelHeadingProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-lime-soft text-forest">
            <Icon name={icon} fill className="text-[20px]" />
          </span>
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bandeaux d'information                                             */
/* ------------------------------------------------------------------ */

export type NoticeTone = "success" | "error" | "info" | "warning";

const NOTICE_TONES: Record<NoticeTone, { box: string; icon: string; iconColor: string; button: string }> = {
  success: { box: "border-emerald-100 bg-emerald-50 text-emerald-900", icon: "check_circle", iconColor: "text-emerald-600", button: "text-emerald-700" },
  error: { box: "border-red-100 bg-red-50 text-danger", icon: "error", iconColor: "text-danger", button: "text-danger" },
  info: { box: "border-sky-100 bg-sky-50 text-sky-900", icon: "info", iconColor: "text-sky-700", button: "text-sky-700" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: "warning", iconColor: "text-amber-700", button: "text-amber-800" },
};

/** Bandeau refermable, aligné sur les messages de succès/erreur des autres pages. */
export function Notice({
  tone = "success",
  children,
  onClose,
  className,
}: {
  tone?: NoticeTone;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const palette = NOTICE_TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm", palette.box, className)}>
      <Icon name={palette.icon} fill className={cn("mt-0.5 text-[20px]", palette.iconColor)} />
      <span className="flex-1">{children}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Fermer le message" className={cn("opacity-60 transition hover:opacity-100", palette.button)}>
          <Icon name="close" className="text-[20px]" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Petits éléments de liste                                           */
/* ------------------------------------------------------------------ */

/** Pastille d'initiale utilisée devant un nom d'établissement ou d'agent. */
export function EntityAvatar({ name, active = true, className }: { name: string; active?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-2xl text-base font-extrabold",
        active ? "bg-lime-soft text-forest" : "bg-neutral-100 text-neutral-500",
        className,
      )}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Petite puce monospace pour les matricules et références. */
export function MonoChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-lg bg-mist px-2 py-1 font-mono text-[11px] font-semibold tabular-nums text-neutral-600",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Point de couleur utilisé dans les badges de statut. */
export function StatusDot({ tone }: { tone: "success" | "danger" | "warning" | "neutral" }) {
  const colors = {
    success: "bg-emerald-600",
    danger: "bg-red-600",
    warning: "bg-amber-500",
    neutral: "bg-neutral-400",
  };
  return <span className={cn("size-1.5 rounded-full", colors[tone])} aria-hidden="true" />;
}
