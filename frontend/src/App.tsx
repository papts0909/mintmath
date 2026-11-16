import { useEffect, useMemo, useState } from "react";
import Editor from "./components/Editor";
import LibraryPanel from "./components/LibraryPanel";
import ShortcutPanel from "./components/ShortcutPanel";
import Toolbar from "./components/Toolbar";
import TouchBar from "./components/TouchBar";
import { useDocStore } from "./core/docStore";
import {
  createAutosaver,
  loadLocal,
  loadSettings,
  saveLocal,
  saveSettings,
  type Settings,
} from "./core/persistence";
import { putDoc, requestPersistentStorage } from "./core/library";
import { saveToDrive, useDriveUi } from "./drive/driveActions";

let persistAsked = false;

// Restore the last session before the first render.
const restored = loadLocal();
if (restored) useDocStore.getState().loadDoc(restored.doc, { driveFileId: restored.driveFileId });

export default function App() {
  const [savedLocally, setSavedLocally] = useState(true);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const autosaver = useMemo(
    () =>
      createAutosaver(() => {
        const st = useDocStore.getState();
        saveLocal({ doc: st.doc, driveFileId: st.driveFileId });
        // Every document also lives in the on-device library.
        putDoc(st.doc)
          .then((stored) => {
            if (stored && !persistAsked) {
              persistAsked = true;
              void requestPersistentStorage();
            }
          })
          .catch(() => {
            /* IndexedDB unavailable (e.g. private mode): localStorage still holds it */
          });
        setSavedLocally(true);
      }),
    [],
  );

  useEffect(() => {
    const unsub = useDocStore.subscribe((s, prev) => {
      if (s.doc !== prev.doc || s.driveFileId !== prev.driveFileId) {
        setSavedLocally(false);
        autosaver.schedule();
      }
    });
    const flush = () => autosaver.flush();
    window.addEventListener("beforeunload", flush);
    return () => {
      unsub();
      window.removeEventListener("beforeunload", flush);
      autosaver.flush();
    };
  }, [autosaver]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "/") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      } else if (mod && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (useDriveUi.getState().signedIn) void saveToDrive();
        else setToast("Đăng nhập Google để lưu lên Drive (tài liệu vẫn được tự lưu trên máy).");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Keep the focused line above MathLive's on-screen keyboard (touch devices).
  useEffect(() => {
    const kbd = window.mathVirtualKeyboard;
    if (!kbd) return;
    const onGeometry = () => {
      const h = kbd.visible ? kbd.boundingRect.height : 0;
      document.documentElement.style.setProperty("--vk-height", `${h}px`);
      if (h) document.querySelector(".line.is-focused")?.scrollIntoView({ block: "nearest" });
    };
    kbd.addEventListener("geometrychange", onGeometry);
    kbd.addEventListener("virtual-keyboard-toggle", onGeometry);
    return () => {
      kbd.removeEventListener("geometrychange", onGeometry);
      kbd.removeEventListener("virtual-keyboard-toggle", onGeometry);
    };
  }, []);

  // Focus the first line on start.
  useEffect(() => {
    const st = useDocStore.getState();
    if (!st.focusedLineId) st.focusLine(st.doc.lines[0].id, "end");
  }, []);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  return (
    <div className="app">
      <Toolbar
        savedLocally={savedLocally}
        settings={settings}
        onSettings={updateSettings}
        onToggleShortcuts={() => setShowShortcuts((v) => !v)}
        onToggleLibrary={() => setShowLibrary((v) => !v)}
        onPreview={(url) => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(url);
        }}
        onMessage={setToast}
      />
      <TouchBar />
      <main className="workspace">
        <Editor autoSubscript={settings.autoSubscript} />
        {showLibrary ? <LibraryPanel onClose={() => setShowLibrary(false)} onMessage={setToast} /> : null}
        {showShortcuts ? <ShortcutPanel onClose={() => setShowShortcuts(false)} /> : null}
      </main>
      {previewUrl ? (
        <div className="preview" role="dialog" aria-label="Xem trước bản in">
          <div className="preview-head">
            <strong>Xem trước bản in</strong>
            <button type="button" onClick={closePreview}>
              Đóng
            </button>
          </div>
          <iframe title="Xem trước PDF" src={previewUrl} />
        </div>
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
