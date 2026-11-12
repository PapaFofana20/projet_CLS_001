// Page vide ou en erreur : icône, titre, petit texte et action éventuelle.
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

interface EmptyProps {
  icon?: string;
  title: string;
  text?: string;
  action?: ReactNode;
}

// État « rien à afficher », quand une liste est vide.
export function EmptyState({ icon = "inbox", title, text, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-6 py-14 text-center shadow-card">
      <span className="mb-4 grid size-16 place-items-center rounded-full bg-lime-soft text-forest">
        <Icon name={icon} className="text-[32px]" />
      </span>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      {text && <p className="mt-1 max-w-md text-sm text-neutral-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface ErrorProps {
  message?: string;
  onRetry?: () => void;
}

// État d'erreur avec bouton pour réessayer.
export function ErrorState({ message = "Une erreur est survenue lors du chargement.", onRetry }: ErrorProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-2xl bg-white px-6 py-14 text-center shadow-card">
      <span className="mb-4 grid size-16 place-items-center rounded-full bg-red-100 text-danger">
        <Icon name="cloud_off" className="text-[32px]" />
      </span>
      <h3 className="text-lg font-bold text-ink">Oups, quelque chose s'est mal passé.</h3>
      <p className="mt-1 max-w-md text-sm text-neutral-500">{message}</p>
      {onRetry && (
        <Button className="mt-5" icon="refresh" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
