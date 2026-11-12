import { useEffect, useState } from "react";

/**
 * Splash Screen — première visite uniquement.
 * - Fond vert forêt (#0F3D1E)
 * - Logo Classora officiel (logo-lime.png) centré, taille généreuse
 * - Animation d'entrée subtile et raffinée (5s total)
 * - Transition fluide vers l'app
 * - Stocké dans localStorage : ne s'affiche qu'une seule fois
 */
export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [show, setShow] = useState(true);
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    const hasSeenSplash = localStorage.getItem("classora-splash-seen");
    if (hasSeenSplash) {
      setShow(false);
      onComplete();
      return;
    }

    // Séquence : enter (1.2s) → hold (2.6s) → exit (1.2s) = 5s total
    const timers = [
      setTimeout(() => setPhase("hold"), 1200),
      setTimeout(() => setPhase("exit"), 3800),
      setTimeout(() => {
        localStorage.setItem("classora-splash-seen", "true");
        setShow(false);
        onComplete();
      }, 5000),
    ];

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  if (!show) return null;

  const logoStyle = {
    width: "320px",
    height: "auto",
    maxWidth: "80vw",
    transformOrigin: "center",
    filter: "drop-shadow(0 0 60px rgba(198, 240, 104, 0.4))",
    transition: "all 1.2s cubic-bezier(0.22, 1, 0.36, 1)",
  } as React.CSSProperties;

  const containerStyle = {
    opacity: phase === "enter" ? 1 : phase === "exit" ? 0 : 1,
    transform:
      phase === "enter" ? "scale(0.98)" : phase === "exit" ? "scale(1.05)" : "scale(1)",
    transition: "opacity 1.2s cubic-bezier(0.22, 1, 0.36, 1), transform 1.2s cubic-bezier(0.22, 1, 0.36, 1)",
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
        transition: "opacity 1.2s cubic-bezier(0.22, 1, 0.36, 1)",
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