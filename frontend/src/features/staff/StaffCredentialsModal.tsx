// Affichage unique des identifiants apres creation ou reinitialisation.

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import type { StaffCredentials } from "@/services/authService";
import type { School } from "@/types";

/** Lien de connexion transmis aux enseignants. */
export const connexionLink = (): string => `${window.location.origin}${import.meta.env.BASE_URL}connexion`;

interface Props {
  open: boolean;
  credentials: StaffCredentials | null;
  school: School | null;
  /** "création" ou "réinitialisation" : seul le titre change. */
  kind?: "creation" | "reset";
  onClose: () => void;
}

/** Lien "Mot de passe oublié" — le personnel définit son propre mot de passe. */
export const forgotPasswordLink = (): string => `${window.location.origin}${import.meta.env.BASE_URL}mot-de-passe-oublie`;

/**
 * Message WhatsApp pré-rempli : lien de connexion, e-mail, lien de définition
 * du mot de passe, matricule. JAMAIS de mot de passe (l'URL `wa.me/?text=`
 * fuiterait dans l'historique et les serveurs WhatsApp).
 */
export function credentialsMessage(credentials: StaffCredentials, school: School | null): string {
  const link = connexionLink();
  return [
    `Bonjour ${credentials.firstName},`,
    ``,
    `Votre accès Classora (${school?.name ?? "votre école"}) est prêt.`,
    ``,
    `🔑 Lien de connexion : ${link}`,
    `✉️ E-mail : ${credentials.email}`,
    `🔐 Définissez votre mot de passe via « Mot de passe oublié » : ${forgotPasswordLink()}`,
    school?.matricule ? `🏫 Matricule de l'école : ${school.matricule}` : "",
    ``,
  ]
    .filter(Boolean)
    .join("\n");
}

function textToCopy(credentials: StaffCredentials, school: School | null): string {
  return credentialsMessage(credentials, school);
}

/**
 * Modale « Accès créé » : les identifiants ne sont affichés qu'une seule fois.
 * Copier les identifiants ou envoyer par WhatsApp.
 */
export function StaffCredentialsModal({ open, credentials, school, kind = "creation", onClose }: Props) {
  if (!credentials) return null;
  const message = textToCopy(credentials, school);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${credentials.email}\n${credentials.password}`);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  const whatsapp = async () => {
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === "creation" ? "Accès créé" : "Mot de passe réinitialisé"}
      size="md"
      footer={
        <>
          <Button variant="outline" icon="print" onClick={() => window.print()}>
            Imprimer
          </Button>
          <Button variant="ghost" icon="save" onClick={() => void copy()}>
            Copier les identifiants
          </Button>
          <Button variant="dark" icon="send" onClick={() => void whatsapp()}>
            Envoyer par WhatsApp
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-2xl bg-lime-soft p-4 text-sm font-medium text-forest">
          Remettez ces identifiants en mains propres. Ce mot de passe ne sera plus jamais affiché après la fermeture.
          Le message WhatsApp ne contient <strong>aucun mot de passe</strong> : la personne définit le sien via « Mot de passe oublié ».
        </p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-mist p-4">
            <dt className="text-xs font-semibold uppercase text-neutral-500">Nom</dt>
            <dd className="mt-1 font-bold">
              {credentials.firstName} {credentials.lastName}
            </dd>
          </div>
          <div className="rounded-xl bg-mist p-4">
            <dt className="text-xs font-semibold uppercase text-neutral-500">Rôle</dt>
            <dd className="mt-1 font-bold capitalize">{credentials.role}</dd>
          </div>
          <div className="rounded-xl bg-mist p-4">
            <dt className="text-xs font-semibold uppercase text-neutral-500">E-mail</dt>
            <dd className="mt-1 break-all font-bold">{credentials.email}</dd>
          </div>
          <div className="rounded-xl bg-mist p-4">
            <dt className="text-xs font-semibold uppercase text-neutral-500">Mot de passe</dt>
            <dd className="mt-1 font-mono text-lg font-bold tracking-wider">{credentials.password}</dd>
          </div>
        </dl>
        {school?.matricule && (
          <p className="flex items-center gap-2 text-sm text-neutral-600">
            <Icon name="key" className="text-[18px] text-forest" />
            Matricule de l'école : <strong className="tracking-[0.25em]">{school.matricule}</strong>
          </p>
        )}
        <p className="text-xs text-neutral-500">Lien de connexion : {connexionLink()}</p>
        <details className="rounded-2xl border border-neutral-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold">Voir le message WhatsApp prérempli</summary>
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-700">{message}</pre>
        </details>
      </div>
    </Modal>
  );
}