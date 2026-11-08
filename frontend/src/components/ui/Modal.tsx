// Fenêtre modale : verrouille le fond, se ferme avec Échap ou un clic dehors.
// Portail sur document.body (comme FilterSheet / Select) : rendue dans le
// flux, son `fixed inset-0` restait piégée dans les ancêtres à overflow-hidden
// / will-change (colonne sidebar, tiroir mobile, @container…) et apparaissait
// superposée au lieu de couvrir l'écran — visible notamment sur la
// confirmation de déconnexion depuis la sidebar.
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import { Icon } from "./Icon";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };

// Fenêtre de base pour les formulaires et confirmations.
export function Modal({ open, onClose, title, children, footer, size = "md" }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="no-print fixed inset-0 z-modal flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-forest/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92vh] w-full ${widths[size]} modal-enter flex-col rounded-t-3xl bg-white shadow-soft focus:outline-none sm:rounded-3xl`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-6 py-4">
          <h2 className="text-lg font-bold text-forest">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer la fenêtre" className="grid size-11 place-items-center rounded-full text-forest hover:bg-mist">
            <Icon name="close" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-100 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation avant action destructive. */
export function ConfirmDialog({ open, title, message, confirmLabel = "Supprimer", loading, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Annuler
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-neutral-700">{message}</p>
    </Modal>
  );
}
