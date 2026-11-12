import { useEffect, useState } from "react";

interface SplashScreenProps {
  /**
   * Affiche le splash à chaque montage, même si l'utilisateur l'a déjà vu.
   * Sans cette option, l'affichage est mémorisé dans localStorage.
   */
  forceShow?: boolean;
  /** Clé localStorage utilisée quand forceShow = false. */
  storageKey?: string;
  /** Durée de l'apparition du logo (ms). */
  enterDuration?: number;
  /** Durée de maintien du logo (ms). */
  holdDuration?: number;
  /** Durée du fondu de sortie (ms). */
  exitDuration?: number;
}

/** Durées par défaut : 2,5 s au total (assez pour lire le logo, sans bloquer la page). */
const DEFAULT_ENTER_DURATION = 600;
const DEFAULT_HOLD_DURATION = 1200;
const DEFAULT_EXIT_DURATION = 700;

/** Lecture défensive : localStorage peut être indisponible (navigation privée, quotas…). */
function hasSeenSplash(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

/**
 * Splash Screen — configurable.
 * - Fond vert forêt (#0F3D1E)
 * - Logo Classora officiel (logo-lime.png) centré, responsive (320px max, 80vw sur mobile)
 * - Animation 3 phases : enter → hold → exit
 * - Le splash est une SURCOUCHE : le contenu de la page est monté immédiatement
 *   en dessous. Il n'attend jamais la fin du splash pour être rendu, ce qui évite
 *   d'afficher une page vide (et donc le footer) pendant le fondu de sortie.
 * - Par défaut : une seule fois via localStorage
 * - Avec forceShow=true : à chaque montage (ex: page d'accueil à chaque visite)
 */
export function SplashScreen({
  forceShow = false,
  storageKey = "classora-splash-seen",
  enterDuration = DEFAULT_ENTER_DURATION,
  holdDuration = DEFAULT_HOLD_DURATION,
  exitDuration = DEFAULT_EXIT_DURATION,
}: SplashScreenProps) {
  // Initialisation paresseuse : si le splash a déjà été vu, il n'est jamais
  // rendu, même une frame (l'ancien useEffect laissait apparaître un flash).
  const [visible, setVisible] = useState(() => forceShow || !hasSeenSplash(storageKey));
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  const totalDuration = enterDuration + holdDuration + exitDuration;

  useEffect(() => {
    if (!visible) return;

    // Le splash est fixe : on bloque le défilement derrière pour éviter
    // d'atterrir au milieu de la page (souvent le footer) à la fin.
    // On compense la largeur de la barre de défilement retirée, sinon le
    // contenu se décale de ~15 px à l'instant où le splash disparaît.
    const bodyOverflow = document.body.style.overflow;
    const bodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // Neutralise une éventuelle position de scroll restaurée par le navigateur
    // avant l'affichage du contenu.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });

    const timers = [
      window.setTimeout(() => setPhase("hold"), enterDuration),
      window.setTimeout(() => setPhase("exit"), enterDuration + holdDuration),
      window.setTimeout(() => {
        if (!forceShow) {
          try {
            window.localStorage.setItem(storageKey, "true");
          } catch {
            // Stockage indisponible : le splash se réaffichera, sans casser la page.
          }
        }
        setVisible(false);
      }, totalDuration),
    ];

    return () => {
      timers.forEach(window.clearTimeout);
      document.body.style.overflow = bodyOverflow;
      document.body.style.paddingRight = bodyPaddingRight;
    };
  }, [visible, forceShow, storageKey, enterDuration, holdDuration, totalDuration]);

  if (!visible) return null;

  const logoTransition = `transform ${phase === "exit" ? exitDuration : enterDuration}ms cubic-bezier(0.22, 1, 0.36, 1)`;

  const logoWrapperStyle = {
    transform: phase === "enter" ? "scale(0.97)" : phase === "exit" ? "scale(1.03)" : "scale(1)",
    transformOrigin: "center",
    transition: logoTransition,
  } as React.CSSProperties;

  const logoStyle = {
    display: "block",
    // Mobile : logo réduit (68vw) ; desktop : 320px maximum.
    width: "clamp(180px, 68vw, 320px)",
    height: "auto",
    filter: "drop-shadow(0 0 60px rgba(198, 240, 104, 0.4))",
  } as React.CSSProperties;

  return (
    <div
      id="splash-screen"
      role="status"
      aria-live="polite"
      aria-label="Chargement de Classora"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0F3D1E",
        display: "grid",
        placeItems: "center",
        opacity: phase === "exit" ? 0 : 1,
        transition: `opacity ${exitDuration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
    >
      <span className="sr-only">Chargement de Classora…</span>
      {/* Le logo est décoratif : le libellé accessible est porté par role="status". */}
      <div style={logoWrapperStyle} aria-hidden="true">
        <img
          src="/images/logo-lime.png"
          alt=""
          width={1121}
          height={240}
          fetchPriority="high"
          decoding="async"
          style={logoStyle}
        />
      </div>
    </div>
  );
}
