import type { MathfieldElement } from "mathlive";
import { fromDisplay } from "../core/displayLatex";
import { useDocStore } from "../core/docStore";

/** Push the focused line's live editor value into the store before a line action. */
function syncFocused(id: string): void {
  const el = document.querySelector(`[data-line-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const value =
    el.tagName === "MATH-FIELD"
      ? fromDisplay((el as MathfieldElement).getValue("latex"))
      : (el as HTMLTextAreaElement).value;
  useDocStore.getState().updateLine(id, value);
}

type Action = { label: string; title: string; run: (id: string) => void };

const ACTIONS: Action[] = [
  {
    label: "＋ Toán",
    title: "Thêm dòng toán",
    run: (id) => useDocStore.getState().insertLineAfter(id, "math"),
  },
  {
    label: "＋ Chữ",
    title: "Thêm dòng chữ",
    run: (id) => useDocStore.getState().insertLineAfter(id, "text"),
  },
  {
    label: "↳ Nối",
    title: "Thêm dòng toán nối (căn cùng khối)",
    run: (id) => useDocStore.getState().insertLineAfter(id, "math", { joinPrev: true }),
  },
  { label: "Toán⇄Chữ", title: "Đổi loại dòng", run: (id) => useDocStore.getState().toggleType(id) },
  {
    label: "▲",
    title: "Đưa dòng lên",
    run: (id) => {
      const st = useDocStore.getState();
      st.moveLine(id, st.doc.lines.findIndex((l) => l.id === id) - 1);
    },
  },
  {
    label: "▼",
    title: "Đưa dòng xuống",
    run: (id) => {
      const st = useDocStore.getState();
      st.moveLine(id, st.doc.lines.findIndex((l) => l.id === id) + 1);
    },
  },
  { label: "⧉", title: "Nhân đôi dòng", run: (id) => void useDocStore.getState().duplicateLine(id) },
  { label: "✕ Dòng", title: "Xóa dòng", run: (id) => useDocStore.getState().deleteLine(id) },
  { label: "↶", title: "Hoàn tác", run: () => void useDocStore.getState().undo() },
  { label: "↷", title: "Làm lại", run: () => void useDocStore.getState().redo() },
];

/** Line actions for touch screens, where Ctrl/Alt shortcuts are not available. */
export default function TouchBar() {
  return (
    <div className="touch-bar" role="toolbar" aria-label="Thao tác dòng">
      {ACTIONS.map((a) => (
        <button
          key={a.title}
          type="button"
          title={a.title}
          aria-label={a.title}
          // Keep focus (and the on-screen keyboard) in the current line.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            const st = useDocStore.getState();
            const id = st.focusedLineId ?? st.doc.lines[st.doc.lines.length - 1].id;
            syncFocused(id);
            a.run(id);
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
