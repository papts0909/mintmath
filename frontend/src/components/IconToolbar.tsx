// The row of most-used commands. What does not fit (lowest priority first)
// moves into the "⋯" menu, which also holds the less common commands.
import { ChevronDown, Ellipsis, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Dropdown, type MenuItem } from "./Menu";

interface Base {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Show the label next to the icon (main commands). */
  showLabel?: boolean;
  /** Shorter text shown on the button (the full label stays its name). */
  shortLabel?: string;
  title?: string;
  /** Higher stays visible longer when space runs out. */
  priority: number;
  group: string;
  /** Only in the "⋯" menu. */
  overflowOnly?: boolean;
}
export type ToolItem = Base &
  (
    | { kind: "button"; onSelect: () => void; disabled?: boolean; shortcut?: string }
    | { kind: "menu"; items: MenuItem[] }
    | { kind: "panel"; render: (close: () => void) => ReactNode }
  );

function asMenuItem(t: ToolItem): MenuItem {
  if (t.kind === "button")
    return { label: t.label, icon: t.icon, onSelect: t.onSelect, disabled: t.disabled, shortcut: t.shortcut };
  if (t.kind === "menu") return { type: "submenu", label: t.label, icon: t.icon, items: t.items };
  return { type: "panel", label: t.label, icon: t.icon, render: t.render };
}

function Face({ t, chevron }: { t: ToolItem; chevron?: boolean }) {
  const Icon = t.icon;
  return (
    <>
      <Icon className="icon" aria-hidden="true" />
      {t.showLabel ? <span>{t.shortLabel ?? t.label}</span> : null}
      {chevron ? <ChevronDown className="icon tb-chevron" aria-hidden="true" /> : null}
    </>
  );
}

const GAP = 4;
const SEP = 9;

export default function IconToolbar({ items, label }: { items: ToolItem[]; label: string }) {
  const inline = items.filter((t) => !t.overflowOnly);
  const box = useRef<HTMLDivElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Set<string>>(() => new Set(inline.map((t) => t.id)));
  const key = inline.map((t) => `${t.id}:${t.showLabel ? (t.shortLabel ?? t.label) : ""}`).join("|");

  useLayoutEffect(() => {
    const el = box.current;
    const m = mirror.current;
    if (!el || !m) return;
    const fit = () => {
      const widths = Array.from(m.children).map((c) => (c as HTMLElement).offsetWidth);
      const more = widths.pop() ?? 40;
      const avail = el.clientWidth - more - GAP;
      const order = inline.map((t, i) => ({ t, i })).sort((a, b) => b.t.priority - a.t.priority);
      const keep = new Set<string>();
      let used = 0;
      const groups = new Set<string>();
      for (const { t, i } of order) {
        const extra = widths[i] + GAP + (groups.has(t.group) || !groups.size ? 0 : SEP);
        if (used + extra > avail) continue;
        used += extra;
        keep.add(t.id);
        groups.add(t.group);
      }
      setVisible((prev) => (prev.size === keep.size && [...keep].every((id) => prev.has(id)) ? prev : keep));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // `key` stands for the measured content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const shown = inline.filter((t) => visible.has(t.id));
  const overflow = [...inline.filter((t) => !visible.has(t.id)), ...items.filter((t) => t.overflowOnly)];
  const overflowItems: MenuItem[] = [];
  overflow.forEach((t, i) => {
    if (i > 0 && overflow[i - 1].group !== t.group) overflowItems.push({ type: "separator" });
    overflowItems.push(asMenuItem(t));
  });

  return (
    <div className="icon-toolbar" role="toolbar" aria-label={label} ref={box}>
      {shown.map((t, i) => (
        <span key={t.id} className="tb-slot">
          {i > 0 && shown[i - 1].group !== t.group ? <span className="tb-sep" aria-hidden="true" /> : null}
          {t.kind === "button" ? (
            <button
              type="button"
              className={`tb-btn${t.showLabel ? " has-label" : ""}`}
              aria-label={t.label}
              title={t.title ?? (t.shortcut ? `${t.label} (${t.shortcut})` : t.label)}
              disabled={t.disabled}
              // Keep the caret (and the on-screen keyboard) in the current line.
              onPointerDown={(e) => e.preventDefault()}
              onClick={t.onSelect}
            >
              <Face t={t} />
            </button>
          ) : (
            <Dropdown
              label={t.label}
              title={t.title ?? t.label}
              className={`tb-dropdown${t.showLabel ? " has-label" : ""}`}
              items={t.kind === "menu" ? t.items : []}
              panel={t.kind === "panel" ? t.render : undefined}
            >
              <Face t={t} chevron />
            </Dropdown>
          )}
        </span>
      ))}
      <Dropdown label="Thêm lệnh" title="Thêm lệnh" className="tb-dropdown tb-more" items={overflowItems}>
        <Ellipsis className="icon" aria-hidden="true" />
      </Dropdown>
      {/* Off-screen copy used to measure every button. */}
      <div className="icon-toolbar-mirror" ref={mirror} aria-hidden="true">
        {inline.map((t) => (
          <span key={t.id} className={`tb-btn${t.showLabel ? " has-label" : ""}`}>
            <Face t={t} chevron={t.kind !== "button"} />
          </span>
        ))}
        <span className="tb-btn">
          <Ellipsis className="icon" />
        </span>
      </div>
    </div>
  );
}
