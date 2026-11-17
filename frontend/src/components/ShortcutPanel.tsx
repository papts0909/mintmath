import { useEffect, useRef, useState } from "react";
import { searchShortcuts, SHORTCUT_GROUPS } from "../core/shortcuts";

interface Props {
  onClose: () => void;
}

const KEYS: [string, string][] = [
  ["Enter", "Dòng mới cùng loại"],
  ["Shift+Enter", "Dòng toán nối (cùng khối căn lề)"],
  ["Backspace ở dòng trống", "Xóa dòng"],
  ["↑ / ↓ ở mép", "Sang dòng trên / dưới"],
  ["Ctrl+'", "Đổi dòng toán ⇄ chữ"],
  ["Alt+↑ / Alt+↓", "Di chuyển dòng"],
  ["Ctrl+D", "Nhân đôi dòng"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Hoàn tác / làm lại"],
  [", trong ma trận", "Sang cột kế / thêm cột"],
  ["; trong ma trận, hệ", "Sang hàng kế / thêm hàng"],
  ["Tab trong ma trận", "Sang ô kế"],
  ["/  ^  _", "Phân số, mũ, chỉ số dưới"],
  ["Ctrl+S", "Lưu lên Backblaze B2 (khi đã kết nối)"],
  ["Ctrl+/", "Bật/tắt bảng này"],
];

export default function ShortcutPanel({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const items = searchShortcuts(query);

  return (
    <aside
      className="shortcut-panel"
      aria-label="Bảng lệnh tắt"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="panel-head">
        <h2>Lệnh tắt</h2>
        <button type="button" onClick={onClose} aria-label="Đóng bảng lệnh tắt">
          ✕
        </button>
      </div>
      <input
        ref={inputRef}
        type="search"
        placeholder="Tìm lệnh…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Tìm lệnh tắt"
      />
      {SHORTCUT_GROUPS.map((g) => {
        const rows = items.filter((s) => s.group === g);
        if (!rows.length) return null;
        return (
          <section key={g}>
            <h3>{g}</h3>
            <table>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.trigger} data-testid="shortcut-row">
                    <td>
                      <kbd>{s.trigger}</kbd>
                    </td>
                    <td>{s.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {!query ? (
        <section>
          <h3>Phím</h3>
          <table>
            <tbody>
              {KEYS.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </aside>
  );
}
