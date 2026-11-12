import { useEffect, useState } from "react";

/**
 * Splash Screen — première visite uniquement.
 * - Fond vert forêt (#0F3D1E)
 * - Logo Classora officiel (logo-lime.png) centré, taille généreuse
 * - Animation d'entrée subtile et raffinée (6s total)
 * - Transition fluide vers l'app
 * - Stocké dans localStorage : ne s'affiche qu'une seule fois
 */
export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [show, setShow] = useState(true);
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  // Durées des phases (en ms) — total 6s pour un tempo confortable
  const ENTER_DURATION = 1500;
  const HOLD_DURATION = 3000;
  const EXIT_DURATION = 1500;
  const TOTAL_DURATION = ENTER_DURATION + HOLD_DURATION + EXIT_DURATION; // 6000ms

  useEffect(() => {
    const hasSeenSplash = localStorage.getItem("classora-splash-seen");
    if (hasSeenSplash) {
      setShow(false);
      onComplete();
      return;
    }

    // Séquence : enter (1.5s) → hold (3.0s) → exit (1.5s) = 6s total
    const timers = [
      setTimeout(() => setPhase("hold"), ENTER_DURATION),
      setTimeout(() => setPhase("exit"), ENTER_DURATION + HOLD_DURATION),
      setTimeout(() => {
        localStorage.setItem("classora-splash-seen", "true");
        setShow(false);
        onComplete();
      }, TOTAL_DURATION),
    ];

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  if (!show) return null;

  const transitionDuration = `${ENTER_DURATION}ms`; // 1.5s pour enter/exit

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