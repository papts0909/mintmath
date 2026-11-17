// Pure helpers for storing MintMath documents in a B2 bucket and syncing the
// on-device library with it.
import type { RemoteObject } from "./b2";

export const DOC_SUFFIX = ".mintmath.json";
/** Documents saved before the app was renamed (MathPad) still count. */
const LEGACY_DOC_SUFFIX = ".mathpad.json";
export const isDocKey = (key: string) => key.endsWith(DOC_SUFFIX) || key.endsWith(LEGACY_DOC_SUFFIX);

/** ASCII slug of a title for object keys (Vietnamese accents removed). */
export function slugTitle(title: string): string {
  const s = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "khong-tieu-de";
}

/** Object key of a document: <prefix><slug>__<id>.mintmath.json. The id keeps
 *  the key stable across devices; the slug keeps the bucket readable. */
export function docKey(prefix: string, doc: { id: string; title: string }): string {
  return `${prefix}${slugTitle(doc.title)}__${doc.id}${DOC_SUFFIX}`;
}

/** Document id from an object key, or null for other files. */
export function docIdFromKey(key: string): string | null {
  const m = /__([A-Za-z0-9_-]+)\.(?:mintmath|mathpad)\.json$/.exec(key);
  return m ? m[1] : null;
}

/** File name shown to the user (key without the prefix). */
export function displayName(key: string, prefix: string): string {
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

/** What was last synced for a document: lets us tell who changed since. */
export interface SyncRecord {
  key: string;
  etag: string;
  /** Local updatedAt at the time of the last sync. */
  updatedAt: string;
}

export type SyncState = Record<string, SyncRecord>;

export interface LocalDocInfo {
  id: string;
  title: string;
  updatedAt: string;
}

export type SyncAction =
  | { type: "upload"; id: string; key: string; replaces?: string }
  | { type: "download"; id: string; key: string }
  /** Both sides changed (or first sync with content on both): keep both. */
  | { type: "conflict"; id: string; key: string };

/** Decide what to transfer. Nothing is ever deleted: a document missing on one
 *  side is copied to it, and a conflict keeps both versions. */
export function planSync(
  local: LocalDocInfo[],
  remote: RemoteObject[],
  state: SyncState,
  prefix: string,
): SyncAction[] {
  const actions: SyncAction[] = [];
  const remoteById = new Map<string, RemoteObject>();
  for (const r of remote) {
    const id = docIdFromKey(r.key);
    if (!id) continue;
    const prev = remoteById.get(id);
    // Two keys for one id (renamed on another device): keep the newest.
    if (!prev || r.lastModified > prev.lastModified) remoteById.set(id, r);
  }
  const localIds = new Set(local.map((d) => d.id));

  for (const doc of local) {
    const r = remoteById.get(doc.id);
    const s = state[doc.id];
    const wanted = docKey(prefix, doc);
    if (!r) {
      actions.push({ type: "upload", id: doc.id, key: wanted });
      continue;
    }
    const localChanged = !s || s.updatedAt !== doc.updatedAt;
    const remoteChanged = !s || s.etag !== r.etag;
    if (s && !localChanged && !remoteChanged) {
      if (r.key !== wanted) actions.push({ type: "upload", id: doc.id, key: wanted, replaces: r.key });
      continue;
    }
    if (localChanged && !remoteChanged) {
      actions.push({
        type: "upload",
        id: doc.id,
        key: wanted,
        ...(r.key !== wanted ? { replaces: r.key } : {}),
      });
    } else if (!localChanged && remoteChanged) {
      actions.push({ type: "download", id: doc.id, key: r.key });
    } else {
      actions.push({ type: "conflict", id: doc.id, key: r.key });
    }
  }
  for (const [id, r] of remoteById) {
    if (!localIds.has(id)) actions.push({ type: "download", id, key: r.key });
  }
  return actions;
}
