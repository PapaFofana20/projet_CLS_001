// Carte blanche de base, avec padding et ombre par défaut.
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Icon } from "./Icon";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  dark?: boolean;
  padded?: boolean;
}

// Corps de la carte, sans les traits d'en-tête.
export function Card({ hover, dark, padded = true, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl shadow-card",
        dark ? "bg-forest text-white" : "bg-white",
        padded && "p-5 sm:p-6",
        hover && "transition-transform duration-300 hover:-translate-y-1 hover:shadow-soft",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Icône affichée dans une pastille lime, comme les panneaux de la console admin. */
  icon?: string;
}

// Titre et sous-titre d'une carte, avec un éventuel bouton à droite.
// Même langage visuel que l'en-tête de panneau de la console admin.
export function CardHeader({ title, subtitle, action, icon }: CardHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
          {icon && (
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-lime-soft text-forest">
              <Icon name={icon} fill className="text-[20px]" />
            </span>
          )}
          {title}
        </h3>
        {subtitle && <p className={cn("text-sm text-neutral-500", icon && "mt-1")}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
