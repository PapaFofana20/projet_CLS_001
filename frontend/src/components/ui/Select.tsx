// Liste déroulante maison : recherche, clavier et portail, mais même usage qu'un <select>.
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";
import { Icon } from "./Icon";

export interface Option {
  value: string;
  label: string;
}

type SelectVariant = "default" | "success" | "danger" | "warning" | "info";

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "multiple" | "size" | "defaultValue"> {
  label?: string;
  error?: string | null;
  options: Option[];
  placeholder?: string;
  compact?: boolean;
  hint?: string;
  /** Affiche un champ de recherche dans la liste (activé automatiquement au-delà de 7 options). */
  searchable?: boolean;
  /** Variante de couleur du déclencheur selon la sélection. */
  variant?: SelectVariant;
}

interface Item extends Option {
  placeholder?: boolean;
}

// On compare sans accents ni casse, pour que « eleve » retrouve « Élève ».
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Menu déroulant moderne : liste flottante, recherche, navigation clavier,
 * sélection contrôlée. Conserve l'API `onChange(e.target.value)` du select natif.
 */
export function Select({
  label,
  error,
  options,
  placeholder,
  compact,
  hint,
  searchable,
  className,
  id,
  onChange,
  onBlur,
  onFocus,
  onClick,
  onKeyDown,
  name,
  value,
  required,
  disabled,
  variant = "default",
  ...rest
}: SelectProps) {
  const auto = useId();
  const triggerId = id ?? auto;
  const listboxId = `${triggerId}-listbox`;
  const labelId = `${triggerId}-label`;
  const errorId = `${triggerId}-err`;
  const hintId = `${triggerId}-hint`;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef<{ text: string; timer: number | undefined }>({ text: "", timer: undefined });

  const currentValue = value === undefined || value === null ? "" : String(value);
  const withSearch = searchable ?? options.length > 7;

  const baseItems = useMemo<Item[]>(
    () => (placeholder !== undefined ? [{ value: "", label: placeholder, placeholder: true }, ...options] : options),
    [placeholder, options],
  );

  const items = useMemo(() => {
    const query = normalize(search.trim());
    if (!query) return baseItems;
    return baseItems.filter((item) => !item.placeholder && normalize(item.label).includes(query));
  }, [baseItems, search]);

  const activeIndex = Math.min(active, Math.max(items.length - 1, 0));
  const selected = baseItems.find((item) => item.value === currentValue && !item.placeholder);
  const selectedLabel = selected?.label ?? "";

  const emitChange = (nextValue: string) => {
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as unknown as ChangeEvent<HTMLSelectElement>);
  };

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const viewWidth = document.documentElement.clientWidth;
    const viewHeight = window.innerHeight;
    const spaceBelow = viewHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const placeAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const width = Math.min(Math.max(rect.width, 160), viewWidth - margin * 2);
    const left = Math.min(Math.max(margin, rect.left), viewWidth - width - margin);
    const maxHeight = Math.max(140, Math.min(320, placeAbove ? spaceAbove : spaceBelow));

    setMenuStyle(
      placeAbove
        ? { left, width, maxHeight, bottom: viewHeight - rect.top + gap }
        : { left, width, maxHeight, top: rect.bottom + gap },
    );
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
      setSearch("");
    }
  }, [disabled, open]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setSearch("");
    };
    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const option = document.getElementById(`${listboxId}-opt-${activeIndex}`);
    if (!list || !option) return;
    const listRect = list.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    if (optionRect.top < listRect.top) list.scrollTop -= listRect.top - optionRect.top;
    else if (optionRect.bottom > listRect.bottom) list.scrollTop += optionRect.bottom - listRect.bottom;
  }, [activeIndex, open, listboxId]);

  const openMenu = () => {
    if (disabled) return;
    setSearch("");
    const index = baseItems.findIndex((item) => item.value === currentValue);
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  };

  const closeMenu = (focusTrigger = false) => {
    setOpen(false);
    setSearch("");
    if (focusTrigger) triggerRef.current?.focus();
  };

  const selectItem = (item: Item) => {
    emitChange(item.placeholder ? "" : item.value);
    closeMenu(true);
  };

  const typeAhead = (char: string) => {
    const state = typeahead.current;
    window.clearTimeout(state.timer);
    state.text += char.toLowerCase();
    state.timer = window.setTimeout(() => {
      state.text = "";
    }, 600);
    const query = normalize(state.text);
    const index = items.findIndex((item) => !item.placeholder && normalize(item.label).startsWith(query));
    if (index >= 0) setActive(index);
  };

  const handleBlur = (e: FocusEvent<HTMLButtonElement>) => {
    if (menuRef.current?.contains(e.relatedTarget as Node)) return;
    if (open) closeMenu();
    onBlur?.(e as unknown as FocusEvent<HTMLSelectElement>);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e as unknown as KeyboardEvent<HTMLSelectElement>);
    if (e.defaultPrevented || disabled) return;

    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (withSearch) {
          setSearch(e.key);
          setActive(0);
          setOpen(true);
        } else {
          openMenu();
          typeAhead(e.key);
        }
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive(Math.min(activeIndex + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(Math.max(items.length - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (items[activeIndex]) selectItem(items[activeIndex]);
        break;
      case "Escape":
        e.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        closeMenu();
        break;
      case "Backspace":
        if (withSearch && search) {
          e.preventDefault();
          setSearch((s) => s.slice(0, -1));
          setActive(0);
        }
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          if (withSearch) {
            setSearch((s) => s + e.key);
            setActive(0);
          } else {
            typeAhead(e.key);
          }
        }
    }
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive(Math.min(activeIndex + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (items[activeIndex]) selectItem(items[activeIndex]);
        break;
      case "Escape":
        e.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        closeMenu();
        triggerRef.current?.focus();
        break;
    }
  };

  const handleTriggerClick = (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.(e as unknown as MouseEvent<HTMLSelectElement>);
    if (open) closeMenu();
    else openMenu();
  };

  return (
    <div className={className}>
      {label && (
        <label id={labelId} htmlFor={triggerId} className="mb-1.5 block text-sm font-semibold text-ink">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && items.length ? `${listboxId}-opt-${activeIndex}` : undefined}
        aria-required={required || undefined}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        disabled={disabled}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
        onClick={handleTriggerClick}
        onFocus={(e) => onFocus?.(e as unknown as FocusEvent<HTMLSelectElement>)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          "group flex w-full items-center justify-between gap-3 rounded-2xl border bg-white pl-4 pr-3 text-left text-sm text-ink transition focus:border-forest focus:outline-none focus-visible:ring-4 focus-visible:ring-lime/50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-mist disabled:text-neutral-500",
          compact ? "min-h-11" : "min-h-12",
          error ? "border-danger" : open ? "border-forest ring-4 ring-lime/40" : "border-neutral-300 hover:border-forest/40",
          variant === "success" && "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100",
          variant === "danger" && "bg-red-50 border-red-300 text-red-800 hover:bg-red-100",
          variant === "warning" && "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100",
          variant === "info" && "bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100",
        )}
      >
        <span className={cn("truncate", !selectedLabel && "text-neutral-400")}>{selectedLabel || placeholder || "Sélectionner…"}</span>
        <Icon name="expand_more" className={cn("shrink-0 text-[20px] text-forest/60 transition-transform duration-200", open && "rotate-180 text-forest")} />
      </button>
      {name && <input type="hidden" name={name} value={currentValue} />}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-medium text-danger">
          <Icon name="error" className="text-[16px]" />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-neutral-500">
          {hint}
        </p>
      ) : null}

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="dropdown popover-enter fixed z-[90] flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-soft ring-1 ring-black/5"
            style={menuStyle}
          >
            {withSearch && (
              <div className="relative shrink-0 px-0.5 pb-1.5">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-forest/50" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Rechercher…"
                  aria-label="Rechercher dans la liste"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-h-11 w-full rounded-xl border border-transparent bg-mist pl-10 pr-3 text-base text-ink placeholder:text-neutral-400 focus:border-forest focus:bg-white focus:outline-none"
                />
              </div>
            )}
            <div ref={listRef} role="listbox" id={listboxId} aria-labelledby={label ? labelId : undefined} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {items.length === 0 ? (
                <p className="px-3 py-3 text-sm text-neutral-500">Aucun résultat pour « {search.trim()} ».</p>
              ) : (
                items.map((item, index) => {
                  const isSelected = item.value === currentValue;
                  return (
                    <div
                      key={`${item.value}-${index}`}
                      id={`${listboxId}-opt-${index}`}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActive(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectItem(item)}
                      className={cn(
                        "flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                        isSelected ? "bg-lime-soft font-semibold text-forest" : index === activeIndex ? "bg-mist text-forest" : "text-ink",
                        item.placeholder && "text-neutral-500",
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                      {isSelected && <Icon name="check" className="shrink-0 text-[18px] text-forest" />}
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
