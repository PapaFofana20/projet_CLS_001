import { useEffect, useState } from "react";

interface SplashScreenProps {
  onComplete: () => void;
  /** Si true, ignore le localStorage et affiche à chaque montage (défaut: false) */
  forceShow?: boolean;
  /** Clé de stockage pour éviter les répétitions (défaut: "classora-splash-seen") */
  storageKey?: string;
}

/**
 * Splash Screen — configurable.
 * - Fond vert forêt (#0F3D1E)
 * - Logo Classora officiel (logo-lime.png) centré, responsive (320px max, 80vw sur mobile)
 * - Animation 3 phases : enter (1.5s) → hold (3s) → exit (1.5s) = 6s total
 * - Transition fluide vers l'app
 * - Par défaut : une seule fois via localStorage
 * - Avec forceShow=true : à chaque montage (ex: page d'accueil à chaque visite)
 */
export function SplashScreen({
  onComplete,
  forceShow = false,
  storageKey = "classora-splash-seen",
}: SplashScreenProps) {
  const [show, setShow] = useState(true);
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  // Durées des phases (en ms) — total 6s pour un tempo confortable
  const ENTER_DURATION = 1500;
  const HOLD_DURATION = 3000;
  const EXIT_DURATION = 1500;
  const TOTAL_DURATION = ENTER_DURATION + HOLD_DURATION + EXIT_DURATION; // 6000ms

  useEffect(() => {
    // Si forceShow, on ignore le stockage et on affiche à chaque fois
    if (!forceShow) {
      const hasSeenSplash = localStorage.getItem(storageKey);
      if (hasSeenSplash) {
        setShow(false);
        onComplete();
        return;
      }
    }

    // Séquence : enter (1.5s) → hold (3.0s) → exit (1.5s) = 6s total
    const timers = [
      setTimeout(() => setPhase("hold"), ENTER_DURATION),
      setTimeout(() => setPhase("exit"), ENTER_DURATION + HOLD_DURATION),
      setTimeout(() => {
        if (!forceShow) {
          localStorage.setItem(storageKey, "true");
        }
        setShow(false);
        onComplete();
      }, TOTAL_DURATION),
    ];

    return () => timers.forEach(clearTimeout);
  }, [onComplete, forceShow, storageKey]);

  if (!show) return null;

  const transitionDuration = `${ENTER_DURATION}ms`;

  const logoStyle = {
    width: "320px",
    height: "auto",
    maxWidth: "80vw",
    transformOrigin: "center",
    filter: "drop-shadow(0 0 60px rgba(198, 240, 104, 0.4))",
    transition: `all ${transitionDuration} cubic-bezier(0.22, 1, 0.36, 1)`,
  } as React.CSSProperties;

  const containerStyle = {
    opacity: phase === "enter" ? 1 : phase === "exit" ? 0 : 1,
    transform:
      phase === "enter" ? "scale(0.98)" : phase === "exit" ? "scale(1.05)" : "scale(1)",
    transition: `opacity ${transitionDuration} cubic-bezier(0.22, 1, 0.36, 1), transform ${transitionDuration} cubic-bezier(0.22, 1, 0.36, 1)`,
  } as React.CSSProperties;

  return (
    <div
      id="splash-screen"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0F3D1E",
        display: "grid",
        placeItems: "center",
        opacity: phase === "enter" ? 1 : phase === "exit" ? 0 : 1,
        transition: `opacity ${transitionDuration} cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
      aria-hidden="true"
      role="img"
      aria-label="Classora — Chargement"
    >
      <div style={containerStyle}>
        <img
          src="/images/logo-lime.png"
          alt="CLASSORA"
          style={logoStyle}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}