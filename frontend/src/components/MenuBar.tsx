// Menu bar (Tệp, Chỉnh sửa, Chèn…). Hovering another title while a menu is
// open switches to it; ←/→ move between menus. On narrow screens the whole
// bar folds into one "Menu" button with the menus as submenus.
import { Menu as MenuIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Dropdown, type MenuItem } from "./Menu";

export interface TopMenu {
  label: string;
  items: MenuItem[];
}

function useNarrow(query = "(max-width: 640px)"): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const q = window.matchMedia?.(query);
    if (!q) return;
    const on = () => setNarrow(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

export default function MenuBar({ menus }: { menus: TopMenu[] }) {
  const narrow = useNarrow();
  const [open, setOpen] = useState<number | null>(null);
  const [byKeyboard, setByKeyboard] = useState(false);

  if (narrow) {
    return (
      <nav className="menubar is-narrow" aria-label="Menu chính">
        <Dropdown
          label="Menu"
          title="Menu"
          className="menubar-all"
          items={menus.map((m) => ({ type: "submenu", label: m.label, items: m.items }))}
        >
          <MenuIcon className="icon" aria-hidden="true" />
          <span>Menu</span>
        </Dropdown>
      </nav>
    );
  }

  const navigate = (from: number, dir: -1 | 1) => {
    const next = (from + dir + menus.length) % menus.length;
    setByKeyboard(true);
    setOpen(next);
    if (open === null) {
      document.querySelectorAll<HTMLButtonElement>(".menubar .dropdown-trigger")[next]?.focus();
    }
  };

  return (
    <div className="menubar" role="menubar" aria-label="Menu chính">
      {menus.map((m, i) => (
        <Dropdown
          key={m.label}
          role="menuitem"
          label={m.label}
          className="menubar-menu"
          items={m.items}
          open={open === i}
          focusOnOpen={byKeyboard}
          onOpenChange={(v) => {
            setByKeyboard(false);
            setOpen(v ? i : null);
          }}
          onNavigate={(dir) => navigate(i, dir)}
          onTriggerEnter={() => {
            if (open !== null && open !== i) setOpen(i);
          }}
        >
          {m.label}
        </Dropdown>
      ))}
    </div>
  );
}
