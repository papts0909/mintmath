import { useEffect, useRef } from "react";
import { downloadBlob } from "../api/exportClient";
import { docFileName, DocFormatError, serializeDoc } from "../core/docFormat";
import { ACCEPTED_FILES, importFile } from "../core/fileImport";
import { newId } from "../core/id";
import { getDoc } from "../core/library";
import { useDocStore } from "../core/docStore";
import type { Settings } from "../core/persistence";
import { saveCurrentToB2, useB2 } from "../cloud/b2Actions";
import { copyLines } from "./Editor";
import ExportMenu from "./ExportMenu";
import InstallBar from "./InstallBar";
import { switchToDoc } from "./LibraryPanel";

interface Props {
  savedLocally: boolean;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onToggleShortcuts: () => void;
  onToggleLibrary: () => void;
  onOpenB2: () => void;
  onPreview: (url: string) => void;
  onMessage: (text: string) => void;
}

export default function Toolbar(props: Props) {
  const title = useDocStore((s) => s.doc.title);
  const canUndo = useDocStore((s) => s.past.length > 0);
  const canRedo = useDocStore((s) => s.future.length > 0);
  const selection = useDocStore((s) => s.selection);
  const b2 = useB2();
  const fileInput = useRef<HTMLInputElement>(null);
  // The settings menu floats over the editor: close it on a click outside or Esc.
  const settingsMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const menu = settingsMenu.current;
      if (!menu?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.contains(e.target as Node))
        menu.open = false;
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, []);

  // The open document is kept in the library, so starting a new one loses nothing.
  const newDoc = () => void switchToDoc(() => useDocStore.getState().newDoc());

  const download = () => {
    const doc = useDocStore.getState().doc;
    downloadBlob(new Blob([serializeDoc(doc)], { type: "application/json" }), docFileName(doc.title));
  };

  const openLocal = async (file: File) => {
    try {
      const r = await importFile(file);
      if (r.kind === "doc") {
        const doc = r.doc;
        // Opening an older copy must not overwrite the library's version.
        const existing = await getDoc(doc.id).catch(() => null);
        if (existing && existing.updatedAt !== doc.updatedAt) doc.id = newId();
        await switchToDoc(() => useDocStore.getState().loadDoc(doc));
      }
      props.onMessage(r.message);
    } catch (e) {
      props.onMessage(e instanceof DocFormatError ? e.message : "Không đọc được tệp.");
    }
  };

  const savedTime = b2.savedAt?.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  return (
    <header className="toolbar">
      <div className="toolbar-row">
        <strong className="brand">MathPad</strong>
        <input
          className="title-input"
          type="text"
          placeholder="Tiêu đề tài liệu"
          aria-label="Tiêu đề"
          value={title}
          onChange={(e) => useDocStore.getState().setTitle(e.target.value)}
        />
        <InstallBar />
        <span className="save-state" role="status" aria-live="polite">
          {props.savedLocally ? "Đã lưu" : "Đang lưu…"}
        </span>
      </div>
      <div className="toolbar-row">
        <div role="group" aria-label="Tệp">
          <button type="button" onClick={props.onToggleLibrary} title="Các bài đã lưu trên máy này">
            📚 Thư viện
          </button>
          <button type="button" onClick={newDoc}>
            Tài liệu mới
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            title=".mathpad.json, .tex hoặc bản sao lưu"
          >
            Mở tệp
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_FILES}
            hidden
            data-testid="open-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void openLocal(f);
              e.target.value = "";
            }}
          />
          <button type="button" onClick={download}>
            Tải về
          </button>
        </div>
        <div role="group" aria-label="Hoàn tác">
          <button
            type="button"
            disabled={!canUndo}
            onClick={() => useDocStore.getState().undo()}
            title="Ctrl+Z"
          >
            ↶ Hoàn tác
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={() => useDocStore.getState().redo()}
            title="Ctrl+Shift+Z"
          >
            ↷ Làm lại
          </button>
        </div>
        <ExportMenu onPreview={props.onPreview} />
      </div>
      <div className="toolbar-row">
        <div role="group" aria-label="Backblaze B2" className="cloud">
          {b2.config ? (
            <>
              <button
                type="button"
                className="primary"
                disabled={b2.busy !== null}
                onClick={() => void saveCurrentToB2()}
                title="Lưu bài đang mở lên B2 (Ctrl+S)"
              >
                ☁ Lưu lên B2
              </button>
              <button type="button" onClick={props.onOpenB2} title="Mở, đồng bộ, quản lý tệp trên B2">
                ☁ {b2.config.bucket}
              </button>
              {b2.busy ? <span className="muted">{b2.busy}</span> : null}
              {!b2.busy && savedTime ? <span className="muted">Đã lưu lên B2 lúc {savedTime}</span> : null}
              {!b2.busy && b2.message?.kind === "error" ? (
                <span className="status error" role="alert">
                  {b2.message.text}
                </span>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              className="cta"
              onClick={props.onOpenB2}
              title="Lưu và mở bài trên tài khoản B2 của bạn"
            >
              ☁ Kết nối Backblaze B2
            </button>
          )}
        </div>
        <div className="settings">
          <button type="button" onClick={props.onToggleShortcuts} title="Ctrl+/">
            ⌨ Lệnh tắt
          </button>
          <details className="settings-menu" ref={settingsMenu}>
            <summary>⚙ Cài đặt</summary>
            <div role="group" aria-label="Cài đặt" className="settings-panel">
              <label>
                <input
                  type="checkbox"
                  checked={props.settings.autoSubscript}
                  onChange={(e) => props.onSettings({ ...props.settings, autoSubscript: e.target.checked })}
                />
                Tự đổi d1 → d₁ (chữ cái + số thành chỉ số dưới)
              </label>
              <label title="Tắt nếu gõ toán bị lỗi khi đang bật bộ gõ tiếng Việt">
                <input
                  type="checkbox"
                  checked={props.settings.imeFix}
                  onChange={(e) => props.onSettings({ ...props.settings, imeFix: e.target.checked })}
                />
                Sửa bộ gõ TV (Telex/VNI trên macOS) trong dòng toán
              </label>
              <label>
                Giao diện{" "}
                <select
                  value={props.settings.theme}
                  onChange={(e) =>
                    props.onSettings({ ...props.settings, theme: e.target.value as Settings["theme"] })
                  }
                >
                  <option value="system">Theo hệ thống</option>
                  <option value="light">Sáng</option>
                  <option value="dark">Tối</option>
                </select>
              </label>
            </div>
          </details>
        </div>
      </div>
      {selection.length ? (
        <div className="toolbar-row selection-bar" role="group" aria-label="Dòng đã chọn">
          <span>Đã chọn {selection.length} dòng</span>
          <button
            type="button"
            onClick={async () => {
              const st = useDocStore.getState();
              const ok = await copyLines(st.doc.lines.filter((l) => st.selection.includes(l.id)));
              props.onMessage(ok ? "Đã sao chép" : "Không truy cập được clipboard");
            }}
          >
            Sao chép
          </button>
          <button type="button" onClick={() => useDocStore.getState().deleteLines(selection)}>
            Xóa
          </button>
          <button type="button" onClick={() => useDocStore.getState().setSelection([])}>
            Bỏ chọn
          </button>
        </div>
      ) : null}
    </header>
  );
}
