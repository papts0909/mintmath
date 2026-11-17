import { Shrink } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "./components/Editor";
import LibraryPanel, { type LibraryTab } from "./components/LibraryPanel";
import { saveCurrentToB2, useB2 } from "./cloud/b2Actions";
import ShortcutPanel from "./components/ShortcutPanel";
import StatusBar from "./components/StatusBar";
import Toolbar from "./components/Toolbar";
import TabBar from "./components/TabBar";
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
import { receiveNewerDoc, restoreTabs } from "./core/tabs";
import { applyTheme } from "./core/theme";
import type { Doc } from "./core/types";
import { isNativeApp } from "./native";

let persistAsked = false;
const ZEN_KEY = "mathpad.zen.v1";

// Restore the last session before the first render.
const restored = loadLocal();
if (restored) useDocStore.getState().loadDoc(restored.doc);
const tabsRestored = restoreTabs();

// Other windows of the app announce saved documents here, so a document open
// in two windows stays current in both.
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("mintmath-docs");

export default function App() {
  const [savedLocally, setSavedLocally] = useState(true);
  const unsaved = useRef(false);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("local");
  const openB2 = () => {
    setLibraryTab("b2");
    setShowLibrary(true);
  };
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Zen mode: only the document is shown. Remembered for this browser tab.
  const [zen, setZenState] = useState(() => {
    try {
      return sessionStorage.getItem(ZEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const setZen = (on: boolean) => {
    setZenState(on);
    if (on) {
      setShowLibrary(false);
      setShowShortcuts(false);
    }
    try {
      sessionStorage.setItem(ZEN_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  };
  const zenRef = useRef(zen);
  zenRef.current = zen;

  const autosaver = useMemo(
    () =>
      createAutosaver(() => {
        const st = useDocStore.getState();
        saveLocal({ doc: st.doc });
        channel?.postMessage({ type: "saved", doc: st.doc });
        unsaved.current = false;
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
      if (s.doc !== prev.doc) {
        // Loading another document is not an edit.
        unsaved.current = s.doc.id === prev.doc.id;
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
    if (!channel) return;
    const onMessage = (e: MessageEvent<{ type: string; doc: Doc }>) => {
      if (e.data?.type !== "saved") return;
      const r = receiveNewerDoc(e.data.doc, unsaved.current);
      if (r === "loaded") setToast("Bài này vừa được cập nhật từ một cửa sổ khác.");
      else if (r === "kept")
        setToast(
          "Bài này cũng đang được sửa ở một cửa sổ khác. Bản ở cửa sổ lưu sau cùng sẽ được giữ — nên chỉ sửa ở một nơi.",
        );
    };
    channel.addEventListener("message", onMessage);
    return () => channel.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    return applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === ".") {
        e.preventDefault();
        setZen(!zenRef.current);
      } else if (mod && e.key === "/") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      } else if (mod && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        // Save to B2 when connected; otherwise offer to connect.
        if (useB2.getState().config) void saveCurrentToB2();
        else {
          setLibraryTab("b2");
          setShowLibrary(true);
        }
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

  // Android back button: close an open panel first, then leave the app.
  const panelsOpen = useRef({ library: false, shortcuts: false });
  panelsOpen.current = { library: showLibrary, shortcuts: showShortcuts };
  useEffect(() => {
    if (!isNativeApp()) return;
    let remove: (() => void) | undefined;
    void import("@capacitor/app").then(({ App: CapApp }) =>
      CapApp.addListener("backButton", () => {
        const kbd = window.mathVirtualKeyboard;
        if (kbd?.visible) kbd.hide();
        else if (panelsOpen.current.library) setShowLibrary(false);
        else if (panelsOpen.current.shortcuts) setShowShortcuts(false);
        else void CapApp.exitApp();
      }).then((h) => {
        remove = () => void h.remove();
      }),
    );
    return () => remove?.();
  }, []);

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

  // Focus the first line on start (once this window's tabs are back).
  useEffect(() => {
    void tabsRestored.then(() => {
      const st = useDocStore.getState();
      if (!st.focusedLineId) st.focusLine(st.doc.lines[0].id, "end");
    });
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
    <div className={zen ? "app is-zen" : "app"}>
      {zen ? (
        <button
          type="button"
          className="zen-exit"
          onClick={() => setZen(false)}
          title="Thoát chế độ Zen (Ctrl+.)"
        >
          <Shrink className="icon" aria-hidden="true" />
          Thoát Zen
        </button>
      ) : null}
      <Toolbar
        onZen={() => setZen(true)}
        savedLocally={savedLocally}
        settings={settings}
        onSettings={updateSettings}
        onToggleShortcuts={() => setShowShortcuts((v) => !v)}
        onToggleLibrary={() => {
          setLibraryTab("local");
          setShowLibrary((v) => !v);
        }}
        onOpenB2={openB2}
        onPreview={(url) => {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(url);
        }}
        onMessage={setToast}
      />
      <TabBar />
      <TouchBar />
      <main className="workspace">
        <Editor autoSubscript={settings.autoSubscript} imeFix={settings.imeFix} />
        {showLibrary ? (
          <LibraryPanel
            onClose={() => setShowLibrary(false)}
            onMessage={setToast}
            tab={libraryTab}
            onTab={setLibraryTab}
          />
        ) : null}
        {showShortcuts ? <ShortcutPanel onClose={() => setShowShortcuts(false)} /> : null}
      </main>
      <StatusBar />
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
