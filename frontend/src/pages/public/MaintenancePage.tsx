// Page de maintenance affichée quand l'administrateur active le mode
// maintenance depuis /admin/parametres. Écran complet, professionnel et
// rassurant pour les visiteurs et les écoles. Sans header ni footer.
import { Link, Navigate } from "react-router-dom";
import { usePlatformStatus } from "@/context/PlatformContext";
import { Logo } from "@/components/ui/Brand";
import { usePageMeta } from "@/hooks/usePageMeta";

export default function MaintenancePage() {
  const { status, loading, refresh } = usePlatformStatus();

  usePageMeta({
    title: "Maintenance — Classora",
    noindex: true,
    description:
      status.maintenanceMessage ||
      "La plateforme Classora est temporairement en maintenance. Revenez bientôt.",
  });

  // Défense en profondeur : si la maintenance a été désactivée alors que le
  // visiteur était sur cette URL, on le ramène à l'accueil dès que l'état réel
  // est connu (favori, BFCache ou garde non remonté).
  if (!loading && !status.maintenanceMode) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center text-center p-6 sm:p-12 lg:p-20 relative overflow-hidden">
      {/* Arrière-plan avec pointillés inspiré de la section contact */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40 [background-image:radial-gradient(#c6f068_1.5px,transparent_1.5px)] [background-size:20px_20px]"
      />
      {/* Forme floue décorative en bas pour apporter de la douceur */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/3 size-[420px] rounded-full bg-lime/40 blur-2xl md:size-[560px]"
        aria-hidden="true"
      />

      {/* Logo Classora en grand, centré */}
      <div className="relative z-10 mb-12">
        <Logo dark={false} className="h-16 sm:h-20 mx-auto" />
      </div>

      <h1 className="relative z-10 mb-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
        Maintenance en cours
      </h1>

      {/* Message personnalisé défini par l'administrateur, ou message par défaut rassurant */}
      <p className="relative z-10 mb-10 max-w-xl mx-auto text-lg sm:text-xl text-neutral-600 leading-relaxed">
        {status.maintenanceMessage?.trim() || (
          <>
            Nous mettons la plateforme à jour pour vous offrir une meilleure
            expérience. Cette interruption est temporaire.
          </>
        )}
      </p>

      {/* Informations de contact rassurantes */}
      <div className="relative z-10 max-w-md mx-auto rounded-2xl bg-forest/5 p-6 sm:p-8 border border-forest/10">
        <p className="mb-3 text-sm font-semibold text-forest">
          Besoin d'aide ?
        </p>
        <p className="mb-2 text-sm text-neutral-600">
          L'équipe Classora reste à votre disposition.
        </p>
        <p className="text-sm text-neutral-600">
          📧 {status.supportEmail || "support@classora.sn"}
          {status.supportPhone ? ` · 📞 ${status.supportPhone}` : ""}
        </p>
      </div>

      {/* Issues possibles sans passer par le bouton « retour » du navigateur :
          re-vérifie le statut, ou tente l'accueil (qui redirigera ici si la
          maintenance est toujours active). */}
      <div className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-5 text-sm">
        <button
          type="button"
          onClick={() => void refresh()}
          className="font-semibold text-forest underline underline-offset-4"
        >
          Réessayer
        </button>
        <Link to="/" className="font-semibold text-forest underline underline-offset-4">
          Retour à l'accueil
        </Link>
      </div>
    </div>
  );
}
