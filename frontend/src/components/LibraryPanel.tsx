import { useCallback, useEffect, useRef, useState } from "react";
import { downloadBlob } from "../api/exportClient";
import { useDocStore } from "../core/docStore";
import { DocFormatError } from "../core/docFormat";
import { ACCEPTED_FILES, importFile } from "../core/fileImport";
import { newId } from "../core/id";
import B2Panel from "./B2Panel";
import {
  deleteDoc,
  exportBackup,
  getDoc,
  listDocs,
  putDoc,
  searchEntries,
  type LibraryEntry,
} from "../core/library";

export type LibraryTab = "local" | "b2";

interface Props {
  onClose: () => void;
  onMessage: (text: string) => void;
  tab: LibraryTab;
  onTab: (tab: LibraryTab) => void;
}

/** Show another document right away and store the one that was open. */
export async function switchToDoc(load: () => void): Promise<void> {
  const previous = useDocStore.getState().doc;
  load();
  try {
    await putDoc(previous);
  } catch {
    /* the library may be unavailable (private mode) */
  }
}

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

export default function LibraryPanel({ onClose, onMessage, tab, onTab }: Props) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const currentId = useDocStore((s) => s.doc.id);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      // Make sure the open document is listed with its latest content.
      await putDoc(useDocStore.getState().doc);
      setEntries(await listDocs());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được thư viện");
      setEntries([]);
    }
  }, []);

  // Reload whenever the local tab is shown: a B2 sync may have added documents.
  useEffect(() => {
    if (tab === "local") void refresh();
  }, [refresh, tab]);

  const open = async (id: string) => {
    const doc = await getDoc(id);
    if (!doc) return void refresh();
    await switchToDoc(() => useDocStore.getState().loadDoc(doc));
    onClose();
  };

  const duplicate = async (entry: LibraryEntry) => {
    const copy = {
      ...entry.doc,
      id: newId(),
      title: `${entry.title || "Không tiêu đề"} (bản sao)`,
      updatedAt: new Date().toISOString(),
    };
    await putDoc(copy);
    await refresh();
  };

  const remove = async (entry: LibraryEntry) => {
    if (!window.confirm(`Xóa “${entry.title || "Không tiêu đề"}” khỏi thư viện trên máy này?`)) return;
    await deleteDoc(entry.id);
    if (entry.id === currentId) useDocStore.getState().newDoc();
    await refresh();
  };

  const newDoc = async () => {
    await switchToDoc(() => useDocStore.getState().newDoc());
    onClose();
  };

  const backup = async () => {
    const data = await exportBackup();
    const day = new Date().toISOString().slice(0, 10);
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      `mathpad-thu-vien-${day}.json`,
    );
    onMessage(`Đã sao lưu ${data.docs.length} bài`);
  };

  const onFiles = async (files: FileList) => {
    let lastDoc = null;
    for (const file of Array.from(files)) {
      try {
        const r = await importFile(file);
        if (r.kind === "doc") {
          // Keep imported files in the library; open the last one.
          r.doc.id = (await getDoc(r.doc.id)) ? newId() : r.doc.id;
          await putDoc(r.doc);
          lastDoc = r.doc;
        }
        onMessage(r.message);
      } catch (e) {
        onMessage(`${file.name}: ${e instanceof DocFormatError ? e.message : "không đọc được tệp"}`);
      }
    }
    if (lastDoc && files.length === 1) {
      const doc = lastDoc;
      await switchToDoc(() => useDocStore.getState().loadDoc(doc));
    }
    await refresh();
  };

  const shown = entries ? searchEntries(entries, query) : [];

  return (
    <aside
      className="side-panel library-panel"
      aria-label="Thư viện bài tập"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="panel-head">
        <h2>Thư viện</h2>
        <button type="button" onClick={onClose} aria-label="Đóng thư viện">
          ✕
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="Nơi lưu">
        <button type="button" role="tab" aria-selected={tab === "local"} onClick={() => onTab("local")}>
          💻 Trên máy
        </button>
        <button type="button" role="tab" aria-selected={tab === "b2"} onClick={() => onTab("b2")}>
          ☁ Backblaze B2
        </button>
      </div>
      {tab === "b2" ? (
        <B2Panel
          onMessage={onMessage}
          onOpened={() => {
            void refresh();
          }}
        />
      ) : (
        <>
          <div className="library-actions">
            <button type="button" onClick={() => void newDoc()}>
              + Bài mới
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              title=".tex, .mathpad.json hoặc bản sao lưu"
            >
              Nhập tệp
            </button>
            <button type="button" onClick={() => void backup()} title="Tải toàn bộ thư viện thành một tệp">
              Sao lưu
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPTED_FILES}
              hidden
              data-testid="library-import"
              onChange={(e) => {
                if (e.target.files?.length) void onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <input
            type="search"
            placeholder="Tìm theo tiêu đề hoặc nội dung…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm trong thư viện"
          />
          {error ? (
            <p className="status error" role="alert">
              {error}
            </p>
          ) : null}
          {entries === null ? <p className="muted">Đang tải…</p> : null}
          {entries && !shown.length ? (
            <p className="muted">
              {query ? "Không tìm thấy bài nào." : "Chưa có bài nào. Bài đang soạn sẽ tự lưu vào đây."}
            </p>
          ) : null}
          <ul className="library-list">
            {shown.map((e) => (
              <li key={e.id} className={e.id === currentId ? "is-current" : ""} data-testid="library-item">
                <button type="button" className="library-open" onClick={() => void open(e.id)}>
                  <strong>{e.title || "Không tiêu đề"}</strong>
                  {e.preview ? <span className="entry-preview">{e.preview}</span> : null}
                  <span className="meta">
                    {fmt(e.updatedAt)} · {e.lineCount} dòng{e.id === currentId ? " · đang mở" : ""}
                  </span>
                </button>
                <span className="library-item-actions">
                  <button
                    type="button"
                    onClick={() => void duplicate(e)}
                    aria-label={`Nhân bản ${e.title}`}
                    title="Nhân bản"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(e)}
                    aria-label={`Xóa ${e.title}`}
                    title="Xóa"
                  >
                    🗑
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Bài được lưu trên thiết bị này. Dùng “Sao lưu” hoặc tab ☁ Backblaze B2 để giữ bản ở nơi khác hay
            chuyển sang máy khác.
          </p>
        </>
      )}
    </aside>
  );
}
