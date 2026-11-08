// Menu « Plus » qui glisse depuis le bas sur mobile, avec tout le reste des liens.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useSchool } from "@/context/SchoolContext";
import { useTeaching } from "@/context/TeachingContext";
import { useAsync } from "@/hooks/useAsync";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { navFor } from "@/routes/navigation";
import { countPendingFor } from "@/services/registrationService";
import type { SessionUser } from "@/types";
import { cn } from "@/utils/cn";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  user: SessionUser;
}

// Panneau complet listant toutes les entrées de menu, regroupées par section.
export function MoreSheet({ open, onClose, user }: Props) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const school = useSchool();
  const { headClasses } = useTeaching();
  const panelRef = useRef<HTMLDivElement>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const pending = useAsync(
    () => (open && user.role === "directeur" ? countPendingFor(user.schoolId) : Promise.resolve(0)),
    [open, user.id, user.role, user.schoolId],
  );

  const items = navFor(user.role, {
    isHead: headClasses.length > 0,
    locked: school.missing,
    badges: (pending.data ?? 0) > 0 ? { "/app/eleves/demandes": pending.data ?? 0 } : {},
  });
  const sections = Array.from(new Set(items.map((item) => item.section)));

  useModalBehavior(open, onClose, panelRef);

  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (media.matches) onClose();
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, [open, onClose]);

  if (!open) return null;

  const handleLogout = () => {
    setConfirmLogout(true);
  };

  return createPortal(
    <div className="no-print fixed inset-0 z-modal md:hidden" role="presentation">
      <div className="absolute inset-0 bg-forest/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        id="more-sheet"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-sheet-title"
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex max-h-[88svh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-soft focus:outline-none drawer-enter"
      >
        <div className="flex justify-center pt-2">
          <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-neutral-300" />
        </div>
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-1">
          <div className="min-w-0">
            <p id="more-sheet-title" className="text-lg font-extrabold text-forest">
              Plus
            </p>
            <p className="truncate text-xs text-neutral-500">
              {user.firstName} {user.lastName}
              {school.schoolName ? ` · ${school.schoolName}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer le menu" className="grid size-11 shrink-0 place-items-center rounded-full bg-mist text-forest">
            <Icon name="close" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {sections.map((section) => (
            <div key={section} className="mb-1">
              <p className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-400">{section}</p>
              <ul className="space-y-0.5">
                {items
                  .filter((item) => item.section === section)
                  .map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === "/app"}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition",
                            isActive ? "bg-lime-soft text-forest" : "text-ink hover:bg-mist",
                          )
                        }
                      >
                        <Icon name={item.icon} className="shrink-0 text-[22px] text-forest/70" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="grid min-w-6 place-items-center rounded-full bg-danger px-1.5 text-xs font-bold leading-6 text-white">{item.badge}</span>
                        ) : null}
                        <Icon name="chevron_right" className="shrink-0 text-[20px] text-neutral-300" />
                      </NavLink>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <div className="mt-2 border-t border-neutral-100 px-1 pt-2">
            <button type="button" onClick={handleLogout} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-danger hover:bg-red-50">
              <Icon name="logout" className="text-[22px]" />
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmLogout}
        onCancel={() => setConfirmLogout(false)}
        title="Se déconnecter"
        message="Voulez-vous vraiment vous déconnecter ?"
        confirmLabel="Oui"
        onConfirm={() => {
          setConfirmLogout(false);
          onClose();
          logout();
          navigate("/", { replace: true });
        }}
      />
    </div>,
    document.body,
  );
}
