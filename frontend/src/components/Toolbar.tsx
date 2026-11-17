import { useRef } from "react";
import { downloadBlob } from "../api/exportClient";
import { docFileName, DocFormatError, serializeDoc } from "../core/docFormat";
import { ACCEPTED_FILES, importFile } from "../core/fileImport";
import { newId } from "../core/id";
import { getDoc } from "../core/library";
import { isNativeApp } from "../native";
import { useDocStore } from "../core/docStore";
import type { Settings } from "../core/persistence";
import {
  driveSignIn,
  driveSignOut,
  openFromDrive,
  saveAsNewAfterMissing,
  saveToDrive,
  useDriveUi,
} from "../drive/driveActions";
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
  onPreview: (url: string) => void;
  onMessage: (text: string) => void;
}

const confirmDiscard = () => window.confirm("Tài liệu hiện tại có thay đổi chưa lưu. Bỏ qua và tiếp tục?");

export default function Toolbar(props: Props) {
  const title = useDocStore((s) => s.doc.title);
  const canUndo = useDocStore((s) => s.past.length > 0);
  const canRedo = useDocStore((s) => s.future.length > 0);
  const selection = useDocStore((s) => s.selection);
  const drive = useDriveUi();
  const fileInput = useRef<HTMLInputElement>(null);

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

  const savedTime = drive.savedAt?.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

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
        <div role="group" aria-label="Google Drive" className="drive">
          {!drive.configured ? (
            <span className="muted" title="Đặt VITE_GOOGLE_CLIENT_ID để bật Google Drive">
              {isNativeApp()
                ? "Google Drive dùng ở bản web; trong app dùng Thư viện → Sao lưu"
                : "Google Drive chưa được cấu hình"}
            </span>
          ) : drive.signedIn ? (
            <>
              <span className="account">👤 {drive.account ?? "Google"}</span>
              <button type="button" disabled={drive.busy} onClick={() => void saveToDrive()} title="Ctrl+S">
                Lưu lên Drive
              </button>
              <button type="button" disabled={drive.busy} onClick={() => void saveToDrive({ copy: true })}>
                Lưu bản sao
              </button>
              <button type="button" disabled={drive.busy} onClick={() => void openFromDrive(confirmDiscard)}>
                Mở từ Drive
              </button>
              <button type="button" onClick={driveSignOut}>
                Đăng xuất
              </button>
            </>
          ) : (
            <button type="button" disabled={drive.busy} onClick={() => void driveSignIn()}>
              Đăng nhập Google
            </button>
          )}
          {savedTime ? <span className="muted">Đã lưu lên Drive lúc {savedTime}</span> : null}
          {drive.message ? (
            <span
              className={`status ${drive.message.kind}`}
              role={drive.message.kind === "error" ? "alert" : "status"}
            >
              {drive.message.text}
            </span>
          ) : null}
          {drive.offerSaveAsNew ? (
            <button type="button" onClick={() => void saveAsNewAfterMissing()}>
              Lưu thành file mới
            </button>
          ) : null}
        </div>
        <div className="settings">
          <button type="button" onClick={props.onToggleShortcuts} title="Ctrl+/">
            ⌨ Lệnh tắt
          </button>
          <details className="settings-menu">
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
