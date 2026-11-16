// Matricule de l'ecole, a copier ou a partager avec les familles.

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { PanelHeading } from "@/features/admin/adminUi";
import type { School } from "@/types";

/** Lien d'inscription pré-rempli avec le matricule. */
export function signupLink(matricule: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}inscription?matricule=${matricule}`;
}

/** Message WhatsApp prêt à envoyer aux familles. */
export function whatsappMessage(school: School): string {
  return [
    `Bonjour 👋`,
    `Les inscriptions sont ouvertes à *${school.name}* (${school.city}).`,
    ``,
    `Inscrivez-vous en 2 minutes depuis votre téléphone :`,
    signupLink(school.matricule),
    ``,
    `Matricule de l'école : *${school.matricule}*`,
  ].join("\n");
}

interface Props {
  school: School;
  canManage?: boolean;
  onChanged?: () => void;
}

/**
 * Carte « Matricule de votre école » : visible en permanence dans le tableau de
 * bord du directeur, copiable en un clic.
 * (QR code volontairement omis : aucune dépendance ajoutée — voir SUPABASE_NOTES.md)
 */
export function MatriculeCard({ school }: Props) {
  const { toast } = useToast();

  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast(message);
    } catch {
      toast("Copie impossible sur cet appareil. Notez le matricule manuellement.", "error");
    }
  };

  const share = async () => {
    const url = signupLink(school.matricule);
    const text = whatsappMessage(school);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Inscription — ${school.name}`, text, url });
        return;
      } catch {
        /* partage annulé : on retombe sur la copie */
      }
    }
    await copy(`${text}\n${url}`, "Lien et message copiés : collez-les dans WhatsApp.");
  };

  // Si pas de matricule encore, afficher un état d'attente
  if (!school.matricule) {
    return (
      <Card>
        <PanelHeading
          icon="key"
          title="Matricule de votre école"
          subtitle="Génération en cours..."
        />
        <div className="mt-6 flex items-center justify-center py-6">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-3 border-forest border-t-transparent" />
            <p className="text-sm text-neutral-600">Génération du matricule sécurisé…</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <PanelHeading
        icon="key"
        title="Matricule de votre école"
        subtitle="Communiqué aux élèves et aux parents pour créer leur compte. Il ne change jamais."
        action={<Badge tone={school.registrationOpen ? "success" : "warning"}>{school.registrationOpen ? "Inscriptions ouvertes" : "Inscriptions fermées"}</Badge>}
      />
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <p className="rounded-2xl bg-forest px-5 py-3 text-3xl font-extrabold tracking-[0.35em] text-lime sm:text-4xl" aria-label={`Matricule ${school.matricule.split("").join(" ")}`}>
          {school.matricule}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button icon="content_copy" variant="outline" onClick={() => void copy(school.matricule, "Matricule copié.")}>
            Copier
          </Button>
          <Button icon="share" variant="dark" onClick={() => void share()}>
            Partager
          </Button>
        </div>
      </div>
    </Card>
  );
}