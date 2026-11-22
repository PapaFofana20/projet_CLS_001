// Compteur animé : il monte jusqu'à la valeur demandée quand on le voit.
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/utils/cn";

interface CounterProps {
  value: string;
  label: string;
  duration?: number;
  delay?: number;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
}

interface ParsedValue {
  /** Valeur numérique finale, magnitude incluse (ex. 2,4M -> 2 400 000). */
  target: number;
  prefix: string;
  suffix: string;
  /** Magnitude affichée comme suffixe (M, K...), 1 si aucune. */
  magnitude: number;
  /** Nombre de décimales à afficher (ex. 2,4M -> 1). */
  decimals: number;
}

/**
 * Extrait proprement la valeur à animer : préfixe, nombre (virgule
 * décimale française comprise), suffixe et magnitude (K / M).
 * "320+" -> 320, suffixe "+"; "2,4M" -> 2 400 000, 1 décimale, suffixe "M".
 */
function parseValue(original: string): ParsedValue {
  const match = original.trim().match(/^([^\d.,-]*)([\d\s.,]+)(.*)$/);
  if (!match) return { target: 0, prefix: "", suffix: original, magnitude: 1, decimals: 0 };

  const [, prefix, rawNumber, suffix] = match;
  const normalized = rawNumber.replace(/\s/g, "").replace(",", ".");
  const parsed = parseFloat(normalized);
  const magnitude = /M/i.test(suffix) ? 1_000_000 : /K/i.test(suffix) ? 1_000 : 1;
  const decimals = normalized.includes(".") ? normalized.split(".")[1].length : 0;

  return {
    target: Number.isFinite(parsed) ? parsed * magnitude : 0,
    prefix,
    suffix,
    magnitude,
    decimals,
  };
}

function formatValue(current: number, parsed: ParsedValue): string {
  const scaled = current / parsed.magnitude;
  const formatted = scaled.toLocaleString("fr-FR", {
    minimumFractionDigits: parsed.decimals,
    maximumFractionDigits: parsed.decimals,
  });
  return `${parsed.prefix}${formatted}${parsed.suffix}`;
}

/** easeOutExpo : départ rapide, arrivée douce — sensation de fluidité. */
function easeOutExpo(progress: number): number {
  return progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
}

export function Counter({
  value,
  label,
  duration = 1800,
  delay = 0,
  className,
  valueClassName,
  labelClassName,
}: CounterProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLParagraphElement>(null);
  const parsed = useMemo(() => parseValue(value), [value]);

  // Premier rendu : on part de zéro (pas de saut depuis la valeur finale).
  const initialValue = useMemo(() => formatValue(0, parsed), [parsed]);

  useEffect(() => {
    const el = elementRef.current;
    const valueEl = valueRef.current;
    if (!el || !valueEl) return;

    const showFinal = () => {
      valueEl.textContent = formatValue(parsed.target, parsed);
    };

    // Respect de prefers-reduced-motion : valeur finale immédiate.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      showFinal();
      return;
    }

    // Pas d'IntersectionObserver : on affiche directement la valeur finale.
    if (typeof IntersectionObserver === "undefined") {
      showFinal();
      return;
    }

    let rafId = 0;
    let timeoutId = 0;
    let cancelled = false;

    const animate = () => {
      const startTime = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const progress = duration > 0 ? Math.min((now - startTime) / duration, 1) : 1;
        // Mise à jour directe du DOM (sans re-render React) : 60 ips fluides.
        valueEl.textContent = formatValue(easeOutExpo(progress) * parsed.target, parsed);
        if (progress < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          showFinal();
        }
      };
      rafId = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          timeoutId = window.setTimeout(animate, delay);
        }
      },
      // On démarre dès qu'une partie significative est visible.
      { threshold: 0.4, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
    };
  }, [parsed, duration, delay]);

  return (
    <div
      ref={elementRef}
      className={cn("rounded-2xl bg-lime p-3 text-center text-forest", className)}
    >
      <p
        ref={valueRef}
        className={cn(
          "text-4xl font-extrabold tabular-nums tracking-tight leading-none sm:text-5xl sm:leading-none",
          valueClassName,
        )}
      >
        {initialValue}
      </p>
      <p className={cn("mt-0 text-xs font-medium text-neutral-600 sm:text-sm", labelClassName)}>
        {label}
      </p>
    </div>
  );
}
