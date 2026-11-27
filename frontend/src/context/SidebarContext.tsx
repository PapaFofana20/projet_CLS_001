import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useHoverExpand, type HoverExpandHandlers } from "@/hooks/useHoverExpand";

/** Largeur du rail replié et de la sidebar déployée. */
export const SIDEBAR_COLLAPSED = 76;
export const SIDEBAR_EXPANDED = 264;
export const SIDEBAR_DELTA = SIDEBAR_EXPANDED - SIDEBAR_COLLAPSED;
/** En dessous de cette largeur de contenu restante, le survol est désactivé (clic sur le logo). */
export const MIN_CONTENT_WIDTH = 720;

const STORAGE_KEY = "classora_sidebar_pinned";

function readPinned(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePinned(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* stockage indisponible : l'épinglage reste valable pour la session */
  }
}

export interface SidebarContextValue {
  /** true quand la sidebar est déployée (survol, focus clavier, épinglée). */
  expanded: boolean;
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
  togglePinned: () => void;
  /** false quand déployer la sidebar réduirait le contenu sous 720 px. */
  hoverEnabled: boolean;
  /** Largeur mesurée de la colonne de contenu. */
  contentWidth: number;
  /** Référence à poser sur la colonne de contenu (flex-1, min-w-0). */
  registerContent: (element: HTMLDivElement | null) => void;
  /** Vrai pendant la transition de largeur (pose will-change). */
  animating: boolean;
  handlers: HoverExpandHandlers;
  expand: () => void;
  collapse: () => void;
  /** Une modale ou un popover ouvert depuis la sidebar la maintient déployée. */
  keepExpanded: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

/**
 * État de la sidebar rétractable qui POUSSE le contenu (colonne 1 d'un flex).
 * • largeur 76 px → 264 px animée en 250 ms ease-out (voir .sidebar-col dans index.css),
 * • survol : 120 ms d'intention à l'entrée, 250 ms de tolérance à la sortie,
 * • épinglage mémorisé (localStorage, try/catch) + raccourci clavier « [ »,
 * • survol désactivé quand le contenu restant passerait sous 720 px (clic sur le logo à la place).
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [pinned, setPinnedState] = useState(readPinned);
  const [contentWidth, setContentWidth] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [overlays, setOverlays] = useState(0);
  const hover = useHoverExpand({ openDelay: 120, closeDelay: 250 });

  const setPinned = useCallback((value: boolean) => {
    setPinnedState(value);
    writePinned(value);
  }, []);
  const togglePinned = useCallback(() => setPinned(!pinned), [pinned, setPinned]);
  const keepExpanded = useCallback((open: boolean) => setOverlays((n) => Math.max(0, n + (open ? 1 : -1))), []);

  // Largeur utile de la colonne de contenu (hors padding), mesurée en continu.
  const observer = useRef<ResizeObserver | null>(null);
  const registerContent = useCallback((element: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!element || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => setContentWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(element);
    observer.current = ro;
    setContentWidth(element.getBoundingClientRect().width);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  const expanded = hover.expanded || pinned || overlays > 0;

  // La largeur mesurée change avec l'état de la sidebar : on la ramène toujours
  // à la largeur repliée avant de décider si le survol tient dans l'écran.
  // Sans cette compensation, l'ouverture réduisait la mesure, désactivait le
  // survol et retirait onPointerLeave alors que le pointeur était encore dedans.
  const collapsedContentWidth = expanded ? contentWidth + SIDEBAR_DELTA : contentWidth;
  const hoverEnabled = contentWidth === 0 || collapsedContentWidth - SIDEBAR_DELTA >= MIN_CONTENT_WIDTH;

  // Si la fenêtre rétrécit pendant une ouverture au survol, le repli ne peut
  // plus être déclenché par onPointerLeave (handlers retirés) : on le force.
  const { collapse: collapseHover } = hover;
  useEffect(() => {
    if (!hoverEnabled) collapseHover();
  }, [hoverEnabled, collapseHover]);

  // Raccourci clavier « [ » : épingle / replie la sidebar (ignoré dans les champs de saisie).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "[" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      setPinned(!pinned);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setPinned, pinned]);

  // will-change posé au début de la transition, retiré juste après.
  const previous = useRef(expanded);
  useEffect(() => {
    if (previous.current === expanded) return;
    previous.current = expanded;
    setAnimating(true);
    const id = window.setTimeout(() => setAnimating(false), 300);
    return () => window.clearTimeout(id);
  }, [expanded]);

  const value = useMemo<SidebarContextValue>(
    () => ({
      ...hover,
      expanded,
      pinned,
      setPinned,
      togglePinned,
      hoverEnabled,
      contentWidth,
      registerContent,
      animating,
      keepExpanded,
    }),
    [hover, expanded, pinned, setPinned, togglePinned, hoverEnabled, contentWidth, registerContent, animating, keepExpanded],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

// Lit l'état de la sidebar (déployée/repliée, survol, épinglage) depuis n'importe quel composant.
export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar doit être utilisé dans <SidebarProvider>.");
  return ctx;
}