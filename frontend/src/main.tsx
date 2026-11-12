// Point d'entrée de l'application : monte React et protège le rendu par une barrière d'erreurs.
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

/**
 * ErrorBoundary : capte les erreurs de rendu React et les affiche explicitement
 * au lieu de laisser un écran blanc silencieux.
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Erreur React capturée :", error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen bg-mist flex items-center justify-center p-4 text-center">
          <div className="max-w-md bg-white rounded-2xl shadow-soft p-6 border border-red-100">
            <div className="mb-4 grid size-16 place-items-center rounded-full bg-red-50 text-red-600">
              <span aria-hidden="true">⚠️</span>
            </div>
            <h2 className="text-lg font-bold text-ink mb-2">Une erreur est survenue</h2>
            <p className="text-sm text-neutral-600 mb-4">
              Un problème inattendu est survenu. Rechargez la page ; si le problème persiste, contactez le support{" "}
              en précisant l'heure de l'erreur.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 rounded-full bg-forest text-white text-sm font-medium hover:bg-forest-600"
            >
              Recharger la page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Désactive la restauration du scroll par le navigateur AVANT le premier rendu :
// au rechargement de l'accueil, il pouvait restaurer une position en bas de page
// (footer) derrière le splash. Fait ici car un useEffect s'exécute trop tard.
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);