// The on-device library of documents ("Thư viện bài tập"), kept in IndexedDB.
// Works the same in the browser, the installed PWA and the Android app.
import { DocFormatError, isDocEmpty, parseDoc } from "./docFormat";
import type { Doc } from "./types";

const DB_NAME = "mathpad";
const DB_VERSION = 1;
const STORE = "docs";

export interface LibraryEntry {
  id: string;
  title: string;
  updatedAt: string;
  /** First non-empty line, for the list. */
  preview: string;
  lineCount: number;
  doc: Doc;
}

export const BACKUP_TYPE = "mintmath-library";
/** Backups made before the app was renamed (MathPad). */
const LEGACY_BACKUP_TYPE = "mathpad-library";

export interface LibraryBackup {
  type: typeof BACKUP_TYPE;
  version: 1;
  exportedAt: string;
  docs: Doc[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("Trình duyệt không hỗ trợ IndexedDB"));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Không mở được thư viện"));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        let result: T;
        req.onsuccess = () => {
          result = req.result;
        };
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error ?? req.error ?? new Error("Lỗi thư viện"));
        t.onabort = () => reject(t.error ?? new Error("Thư viện bị hủy thao tác"));
      }),
  );
}

export function previewOf(doc: Doc): string {
  const first = doc.lines.find((l) => l.content.trim());
  if (!first) return "";
  const text =
    first.type === "math"
      ? first.content
          .replace(/\\(?:text|mathrm|mathbb)\{([^}]*)\}/g, " $1 ")
          .replace(/\\[a-zA-Z]+/g, " ")
          .replace(/[{}]/g, "")
      : first.content;
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

export function toEntry(doc: Doc): LibraryEntry {
  return {
    id: doc.id,
    title: doc.title,
    updatedAt: doc.updatedAt,
    preview: previewOf(doc),
    lineCount: doc.lines.length,
    doc,
  };
}

/** Save (insert or replace) a document. Empty documents are not stored. */
export async function putDoc(doc: Doc): Promise<boolean> {
  if (isDocEmpty(doc)) return false;
  await tx("readwrite", (s) => s.put(toEntry(doc)));
  return true;
}

export async function getDoc(id: string): Promise<Doc | null> {
  const entry = await tx<LibraryEntry | undefined>("readonly", (s) => s.get(id));
  return entry ? entry.doc : null;
}

export async function deleteDoc(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

/** All documents, most recently edited first. */
export async function listDocs(): Promise<LibraryEntry[]> {
  const all = await tx<LibraryEntry[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function searchEntries(entries: LibraryEntry[], query: string): LibraryEntry[] {
  const q = query.trim().toLocaleLowerCase("vi");
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.title.toLocaleLowerCase("vi").includes(q) ||
      e.doc.lines.some((l) => l.content.toLocaleLowerCase("vi").includes(q)),
  );
}

export async function exportBackup(): Promise<LibraryBackup> {
  const entries = await listDocs();
  return {
    type: BACKUP_TYPE,
    version: 1,
    exportedAt: new Date().toISOString(),
    docs: entries.map((e) => e.doc),
  };
}

export function isBackup(value: unknown): value is { type: string; docs: unknown[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    [BACKUP_TYPE, LEGACY_BACKUP_TYPE].includes((value as { type?: unknown }).type as string) &&
    Array.isArray((value as { docs?: unknown }).docs)
  );
}

/** Merge a backup into the library: new documents are added, and a document
 *  that already exists is replaced only if the backup copy is newer. */
export async function importBackup(
  value: unknown,
): Promise<{ added: number; updated: number; skipped: number }> {
  if (!isBackup(value)) throw new DocFormatError("Tệp không phải bản sao lưu thư viện MintMath.");
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const raw of value.docs) {
    let doc: Doc;
    try {
      doc = parseDoc(raw);
    } catch {
      skipped++;
      continue;
    }
    const existing = await getDoc(doc.id);
    if (!existing) {
      if (await putDoc(doc)) added++;
      else skipped++;
    } else if (doc.updatedAt > existing.updatedAt) {
      await putDoc(doc);
      updated++;
    } else {
      skipped++;
    }
  }
  return { added, updated, skipped };
}

/** Ask the browser not to evict the library under storage pressure (iOS, Android). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** For tests: drop the cached connection. */
export function _resetLibraryConnection(): void {
  dbPromise = null;
}
