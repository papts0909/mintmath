import { Plus, X } from "lucide-react";
import { useRef } from "react";
import { activateTab, closeTab, openNewDoc, useTabs } from "../core/tabs";

const label = (title: string) => title.trim() || "Không tiêu đề";

/** One tab per open document; ←/→ move between tabs, middle click closes. */
export default function TabBar() {
  const { tabs, active } = useTabs();
  const list = useRef<HTMLDivElement>(null);

  const focusTab = (i: number) => {
    const t = tabs[(i + tabs.length) % tabs.length];
    void activateTab(t.id).then(() =>
      list.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${t.id}"]`)?.focus(),
    );
  };

  return (
    <nav className="tab-bar" aria-label="Các bài đang mở">
      <div className="tab-list" role="tablist" aria-label="Các bài đang mở" ref={list}>
        {tabs.map((t, i) => {
          const isActive = t.id === active;
          return (
            <div key={t.id} className={`doc-tab${isActive ? " is-active" : ""}`}>
              <button
                type="button"
                role="tab"
                data-tab-id={t.id}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                title={label(t.title)}
                onClick={() => void activateTab(t.id)}
                onAuxClick={(e) => {
                  if (e.button === 1) void closeTab(t.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") focusTab(i + 1);
                  else if (e.key === "ArrowLeft") focusTab(i - 1);
                  else if (e.key === "Home") focusTab(0);
                  else if (e.key === "End") focusTab(tabs.length - 1);
                  else return;
                  e.preventDefault();
                }}
              >
                <span className="doc-tab-title">{label(t.title)}</span>
              </button>
              <button
                type="button"
                className="doc-tab-close"
                aria-label={`Đóng tab ${label(t.title)}`}
                title="Đóng tab (bài vẫn còn trong Thư viện)"
                onClick={() => void closeTab(t.id)}
              >
                <X className="icon" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="doc-tab-new"
        aria-label="Mở bài mới trong tab mới"
        title="Bài mới trong tab mới"
        onClick={openNewDoc}
      >
        <Plus className="icon" aria-hidden="true" />
      </button>
    </nav>
  );
}
