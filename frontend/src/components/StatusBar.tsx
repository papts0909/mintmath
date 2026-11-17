import { useDocStore } from "../core/docStore";

/** Bottom bar: which line has the caret, its type, and the keys that apply. */
export default function StatusBar() {
  const lines = useDocStore((s) => s.doc.lines);
  const focusedId = useDocStore((s) => s.focusedLineId);
  const idx = lines.findIndex((l) => l.id === focusedId);
  const line = idx >= 0 ? lines[idx] : null;
  return (
    <footer className="status-bar" aria-live="polite">
      {line ? (
        <>
          <span className={`status-type ${line.type}`}>{line.type === "math" ? "∑ Toán" : "T Chữ"}</span>
          <span>
            Dòng {idx + 1}/{lines.length}
            {line.joinPrev ? " · nối dòng trên" : ""}
          </span>
          <span className="status-keys">
            {line.type === "math"
              ? "Enter: dòng mới · Ctrl+': sang chữ · Tab/, : ô kế · ; : hàng kế · / phân số · ^ mũ"
              : "Enter: dòng mới · Ctrl+': sang toán · ↑↓: chuyển dòng"}
          </span>
        </>
      ) : (
        <span>Bấm vào một dòng để bắt đầu gõ · Ctrl+/ xem lệnh tắt</span>
      )}
    </footer>
  );
}
