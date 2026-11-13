// Logo, avatar et petites marques visuelles de l'application.
import { Link } from "react-router-dom";
import { cn } from "@/utils/cn";
import { initialsGrapheme } from "@/utils/format";

// Grand logo avec lien vers l'accueil.
export function Logo({ dark, className, to = "/" }: { dark?: boolean; className?: string; to?: string }) {
  return (
    <Link to={to} aria-label="CLASSORA, retour à l'accueil" className="inline-flex items-center">
      <img
        src={dark ? "/images/logo-lime.webp" : "/images/logo-dark.webp"}
        alt="CLASSORA"
        width={240}
        height={52}
        className={cn("max-w-full w-auto h-auto", className ?? "h-8")}
      />
    </Link>
  );
}

/**
 * Marque seule (emblème lime sur fond transparent), utilisée là où le
 * logotype complet ne tient pas : sidebar repliée sur ordinateur.
 */
export function LogoMark({ className, alt = "" }: { className?: string; alt?: string }) {
  return (
    <img
      src="/images/logo-mark-lime.svg"
      alt={alt}
      width={40}
      height={40}
      className={cn("h-10 w-10 object-contain", className)}
    />
  );
}

// Rond avec les initiales quand il n'y a pas de photo.
export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const [first, last] = name.trim().split(" ").filter(Boolean);
  const letters = initialsGrapheme(first ?? "", last ?? "");
  return (
    <span aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.36 }} className={cn("inline-grid shrink-0 place-items-center rounded-full bg-lime font-bold text-forest", className)}>
      {letters}
    </span>
  );
}

// Petite barre de progression, bornée entre 0 et 100 pour éviter les débordements.
export function ProgressBar({ value, className, tone = "leaf" }: { value: number; className?: string; tone?: "leaf" | "warning" | "danger" }) {
  const colors = { leaf: "bg-leaf", warning: "bg-amber-500", danger: "bg-danger" };
  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full bg-neutral-200", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width,background-color] duration-300", colors[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/** Initiales d'une école : 2 lettres, pour la pastille d'identité visuelle. */
export function schoolInitials(name: string): string {
  const parts = name.replace(/^(Coll[eè]ge|Groupe Scolaire|Institut|Complexe Scolaire|Complexe|École)\s+/i, "").split(/\s+/);
  return `${parts[0]?.charAt(0) ?? "E"}${parts[parts.length - 1]?.charAt(0) ?? ""}`.toUpperCase();
}

/** Identité visuelle de l'école : logo (ou initiales) + nom, affichés dans l'application. */
export function SchoolMark({ name, matricule, size = 40, className, dark = false }: { name: string; matricule?: string; size?: number; className?: string; dark?: boolean }) {
  const letters = schoolInitials(name);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span style={{ width: size, height: size, fontSize: size * 0.34 }} className={cn("grid shrink-0 place-items-center rounded-xl font-extrabold", dark ? "bg-lime text-forest" : "bg-forest text-lime", className)}>
        {letters}
      </span>
      <span className="min-w-0">
        <span className={cn("block truncate text-sm font-bold leading-tight", dark ? "text-white" : "text-ink")}>{name}</span>
        {matricule && <span className={cn("block text-[11px] font-semibold tracking-wider", dark ? "text-lime" : "text-forest-500")}>{matricule}</span>}
      </span>
    </span>
  );
}
