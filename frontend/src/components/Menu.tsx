// Drop-down menus (menu bar, toolbar buttons, "⋯"), WAI-ARIA menu pattern:
// ↑/↓ move, →/Enter open a submenu, ←/Esc go back, Home/End, Tab closes.
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type MenuItem =
  | {
      type?: "action";
      label: string;
      icon?: LucideIcon;
      shortcut?: string;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { type: "check" | "radio"; label: string; checked: boolean; onSelect: () => void }
  | { type: "submenu"; label: string; icon?: LucideIcon; items: MenuItem[]; disabled?: boolean }
  /** A submenu with custom content, e.g. the matrix size picker. */
  | { type: "panel"; label: string; icon?: LucideIcon; render: (close: () => void) => ReactNode }
  | { type: "separator" };

const isFocusable = (i: MenuItem) => i.type !== "separator" && !("disabled" in i && i.disabled);
const opensChild = (i: MenuItem) => i.type === "submenu" || i.type === "panel";

interface ListProps {
  items: MenuItem[];
  label: string;
  /** Close the whole menu; `restore` puts focus back on its trigger. */
  onClose: (restore: boolean) => void;
  /** Leave this submenu (← or Esc) and return to its parent item. */
  onBack?: () => void;
  /** Top level of a menu bar: ←/→ move to the neighbouring menu. */
  onNavigate?: (dir: -1 | 1) => void;
  focusFirst: boolean;
  className?: string;
}

function MenuList({ items, label, onClose, onBack, onNavigate, focusFirst, className }: ListProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const [openChild, setOpenChild] = useState<number | null>(null);
  const [childFocus, setChildFocus] = useState(false);
  const [flip, setFlip] = useState(false);

  useLayoutEffect(() => {
    // Keep the menu on screen: open leftwards when there is no room on the right.
    // (The visible width: an overflowing menu can widen the page itself.)
    const width = Math.min(
      window.innerWidth,
      document.documentElement.clientWidth,
      window.visualViewport?.width ?? Infinity,
    );
    const r = box.current?.getBoundingClientRect();
    if (r && r.right > width - 4) setFlip(true);
  }, []);
  // Items are rebuilt on every render; focus the first one only when asked.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (focusFirst) refs.current.find((b, i) => b && isFocusable(itemsRef.current[i]))?.focus();
  }, [focusFirst]);

  const move = (from: number, dir: 1 | -1) => {
    for (let k = 1; k <= items.length; k++) {
      const i = (from + dir * k + items.length * 2) % items.length;
      if (isFocusable(items[i])) return refs.current[i]?.focus();
    }
  };
  const current = () => refs.current.findIndex((b) => b === document.activeElement);

  const onKeyDown = (e: KeyboardEvent) => {
    const i = current();
    if (i < 0) return; // the key belongs to a child menu or panel
    const item = items[i];
    switch (e.key) {
      case "ArrowDown":
        move(i, 1);
        break;
      case "ArrowUp":
        move(i, -1);
        break;
      case "Home":
        move(-1, 1);
        break;
      case "End":
        move(items.length, -1);
        break;
      case "ArrowRight":
        if (opensChild(item)) {
          setOpenChild(i);
          setChildFocus(true);
        } else if (onNavigate) onNavigate(1);
        else return;
        break;
      case "ArrowLeft":
        if (onBack) onBack();
        else if (onNavigate) onNavigate(-1);
        else return;
        break;
      case "Escape":
        if (onBack) onBack();
        else onClose(true);
        break;
      case "Tab":
        onClose(false);
        return;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={box}
      role="menu"
      aria-label={label}
      className={`menu-popup${flip ? " flip" : ""}${className ? ` ${className}` : ""}`}
      onKeyDown={onKeyDown}
    >
      {items.map((item, i) => {
        if (item.type === "separator") return <div key={i} role="separator" className="menu-sep" />;
        const setRef = (b: HTMLButtonElement | null) => {
          refs.current[i] = b;
        };
        if ("checked" in item) {
          return (
            <button
              key={i}
              ref={setRef}
              type="button"
              role={item.type === "check" ? "menuitemcheckbox" : "menuitemradio"}
              aria-checked={item.checked}
              tabIndex={-1}
              className="menu-item"
              onMouseEnter={() => setOpenChild(null)}
              onClick={() => {
                onClose(false);
                item.onSelect();
              }}
            >
              <span className="menu-icon">
                {item.checked ? <Check className="icon" aria-hidden="true" /> : null}
              </span>
              <span className="menu-label">{item.label}</span>
            </button>
          );
        }
        const Icon = item.icon;
        if ("items" in item || "render" in item) {
          const open = openChild === i;
          const back = () => {
            setOpenChild(null);
            refs.current[i]?.focus();
          };
          return (
            <div key={i} className="menu-sub-wrap" onMouseEnter={() => setOpenChild(i)}>
              <button
                ref={setRef}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                tabIndex={-1}
                disabled={"disabled" in item && item.disabled}
                className="menu-item"
                onClick={() => {
                  setOpenChild(open ? null : i);
                  setChildFocus(false);
                }}
              >
                <span className="menu-icon">
                  {Icon ? <Icon className="icon" aria-hidden="true" /> : null}
                </span>
                <span className="menu-label">{item.label}</span>
                <ChevronRight className="icon menu-chevron" aria-hidden="true" />
              </button>
              {open && "items" in item ? (
                <MenuList
                  items={item.items}
                  label={item.label}
                  onClose={onClose}
                  onBack={back}
                  focusFirst={childFocus}
                  className="menu-child"
                />
              ) : null}
              {open && "render" in item ? (
                <div
                  className="menu-popup menu-child menu-panel"
                  role="group"
                  aria-label={item.label}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" || e.key === "ArrowLeft") {
                      e.preventDefault();
                      e.stopPropagation();
                      back();
                    }
                  }}
                >
                  {item.render(() => onClose(false))}
                </div>
              ) : null}
            </div>
          );
        }
        return (
          <button
            key={i}
            ref={setRef}
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-keyshortcuts={item.shortcut?.replace("⌘", "Meta+")}
            disabled={item.disabled}
            className="menu-item"
            onMouseEnter={() => setOpenChild(null)}
            onClick={() => {
              onClose(false);
              item.onSelect();
            }}
          >
            <span className="menu-icon">{Icon ? <Icon className="icon" aria-hidden="true" /> : null}</span>
            <span className="menu-label">{item.label}</span>
            {item.shortcut ? (
              <kbd className="menu-shortcut" aria-hidden="true">
                {item.shortcut}
              </kbd>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

interface DropdownProps {
  /** Text or icon + text on the button. */
  children: ReactNode;
  /** Accessible name (also the menu's name). */
  label: string;
  title?: string;
  items: MenuItem[];
  className?: string;
  /** Controlled open state (menu bar). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onNavigate?: (dir: -1 | 1) => void;
  onTriggerEnter?: () => void;
  role?: "menuitem";
  /** Focus the first item when opened (keyboard), or not (pointer). */
  focusOnOpen?: boolean;
  /** Custom content instead of a list of items (e.g. the matrix picker). */
  panel?: (close: () => void) => ReactNode;
}

export function Dropdown(props: DropdownProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const [focusFirst, setFocusFirst] = useState(false);
  const open = props.open ?? ownOpen;
  const setOpen = (v: boolean) => (props.onOpenChange ? props.onOpenChange(v) : setOwnOpen(v));
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  });
  useEffect(() => {
    if (open && props.focusOnOpen) setFocusFirst(true);
  }, [open, props.focusOnOpen]);

  const close = (restore: boolean) => {
    setOpen(false);
    setFocusFirst(false);
    if (restore) trigger.current?.focus();
  };

  return (
    <div className={`dropdown${props.className ? ` ${props.className}` : ""}`} ref={root}>
      <button
        ref={trigger}
        type="button"
        role={props.role}
        className="dropdown-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={props.label}
        title={props.title}
        onClick={() => {
          setFocusFirst(false);
          setOpen(!open);
        }}
        onMouseEnter={props.onTriggerEnter}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || ((e.key === "Enter" || e.key === " ") && !open)) {
            e.preventDefault();
            setFocusFirst(true);
            setOpen(true);
          } else if (e.key === "ArrowRight" && props.onNavigate) {
            e.preventDefault();
            props.onNavigate(1);
          } else if (e.key === "ArrowLeft" && props.onNavigate) {
            e.preventDefault();
            props.onNavigate(-1);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            close(true);
          }
        }}
      >
        {props.children}
      </button>
      {open && props.panel ? (
        <div
          className="menu-popup menu-panel"
          role="group"
          aria-label={props.label}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Tab") {
              e.stopPropagation();
              close(e.key === "Escape");
            }
          }}
        >
          {props.panel(() => close(false))}
        </div>
      ) : null}
      {open && !props.panel ? (
        <MenuList
          items={props.items}
          label={props.label}
          onClose={close}
          onNavigate={props.onNavigate}
          focusFirst={focusFirst}
        />
      ) : null}
    </div>
  );
}
