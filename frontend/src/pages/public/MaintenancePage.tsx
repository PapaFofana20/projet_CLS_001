// Page de maintenance affichée quand l'administrateur active le mode
// maintenance depuis /admin/parametres. Remplace le simple bandeau par un
// écran complet, professionnel et rassurant pour les visiteurs et les écoles.
import { usePlatformStatus } from "@/context/PlatformContext";
import { Logo } from "@/components/ui/Brand";
import { Icon } from "@/components/ui/Icon";
import { Button, LinkButton } from "@/components/ui/Button";
import { usePageMeta } from "@/hooks/usePageMeta";

export default function MaintenancePage() {
  const { status } = usePlatformStatus();

  usePageMeta({
    title: "Maintenance — Classora",
    noindex: true,
    description:
      status.maintenanceMessage ||
      "La plateforme Classora est temporairement en maintenance. Revenez bientôt.",
  });

  const retry = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center text-center p-6 sm:p-12 lg:p-20">
      {/* Logo Classora en grand, centré */}
      <div className="mb-8">
        <Logo dark={false} className="h-16 sm:h-20 mx-auto" />
      </div>

      {/* Icône de maintenance dans un cercle doux */}
      <div className="mb-8 inline-flex items-center justify-center rounded-full bg-amber-50 p-4 sm:p-6 shadow-sm">
        <Icon
          name="engineering"
          fill
          className="text-[48px] sm:text-[64px] text-amber-600"
          aria-hidden="true"
        />
      </div>

      <h1 className="mb-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
        Maintenance en cours
      </h1>

      {/* Message personnalisé défini par l'administrateur, ou message par défaut rassurant */}
      <p className="mb-6 max-w-xl mx-auto text-lg sm:text-xl text-neutral-600 leading-relaxed">
        {status.maintenanceMessage?.trim() || (
          <>
            Nous mettons la plateforme à jour pour vous offrir une meilleure
            expérience. Cette interruption est temporaire.
          </>
        )}
      </p>

      {/* Informations de contact rassurantes */}
      <div className="mb-10 max-w-md mx-auto rounded-2xl bg-forest/5 p-6 sm:p-8 border border-forest/10">
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

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button
          variant="dark"
          onClick={retry}
          className="px-8 py-3 text-sm sm:text-base"
        >
          Réessayer
        </Button>
        <LinkButton to="/" variant="outline" className="px-8 py-3 text-sm sm:text-base">
          Retour à l'accueil
        </LinkButton>
      </div>
    </div>
  );
}
