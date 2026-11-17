// B2 state for the UI and the operations behind its buttons.
import { create } from "zustand";
import { DocFormatError, parseDocText, serializeDoc } from "../core/docFormat";
import { useDocStore } from "../core/docStore";
import { getDoc, listDocs, putDoc } from "../core/library";
import { newId } from "../core/id";
import { importTex } from "../core/texImport";
import type { Doc } from "../core/types";
import { isDesktopApp, isNativeApp } from "../native";
import {
  B2Error,
  createB2Client,
  DEFAULT_PREFIX,
  normalizePrefix,
  parseEndpoint,
  type B2Client,
  type B2Config,
  type RemoteObject,
} from "./b2";
import { DOC_SUFFIX, docIdFromKey, docKey, planSync, type SyncState } from "./b2Sync";
import { setMathpadCors } from "../../scripts/b2-cors.mjs";

const CONFIG_KEY = "mathpad.b2.v1";
const SYNC_KEY = "mathpad.b2.sync.v1";

// ---------- persistence (this device only) ----------

export function loadB2Config(storage: Storage = localStorage): B2Config | null {
  try {
    const raw = storage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<B2Config>;
    if (!c.keyId || !c.appKey || !c.bucket || !c.endpoint) return null;
    return {
      keyId: c.keyId,
      appKey: c.appKey,
      bucket: c.bucket,
      endpoint: c.endpoint,
      prefix: normalizePrefix(c.prefix ?? DEFAULT_PREFIX),
    };
  } catch {
    return null;
  }
}

function saveB2Config(cfg: B2Config | null): void {
  try {
    if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* storage unavailable */
  }
}

function loadSyncState(): SyncState {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY) ?? "{}") as SyncState;
  } catch {
    return {};
  }
}

function saveSyncState(s: SyncState): void {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// ---------- network ----------

/** Desktop app: Tauri's HTTP plugin (no CORS). Android: Capacitor patches
 *  window.fetch with native HTTP (CapacitorHttp). Browser/PWA: fetch, which
 *  needs a CORS rule on the bucket. */
async function platformFetch(url: string, init: RequestInit): Promise<Response> {
  if (isDesktopApp()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(url, init);
  }
  return fetch(url, init);
}

let fetchImpl: (url: string, init: RequestInit) => Promise<Response> = platformFetch;
/** Tests can swap the transport. */
export function _setB2Fetch(f: typeof fetchImpl): void {
  fetchImpl = f;
}

function client(cfg: B2Config): B2Client {
  return createB2Client(cfg, (url, init) => fetchImpl(url, init));
}

// ---------- UI state ----------

type Msg = { kind: "info" | "error"; text: string } | null;

/** Set when the browser was blocked by a missing CORS rule: the settings to
 *  retry with, and whether enabling it from the app already failed. */
export interface CorsNeeded {
  cfg: B2Config;
  origin: string;
  autoFailed: boolean;
}

interface B2State {
  config: B2Config | null;
  busy: string | null;
  message: Msg;
  files: RemoteObject[] | null;
  savedAt: Date | null;
  cors: CorsNeeded | null;
}

export const useB2 = create<B2State>()(() => ({
  config: loadB2Config(),
  busy: null,
  message: null,
  files: null,
  savedAt: null,
  cors: null,
}));

export function describeB2Error(e: unknown): string {
  if (e instanceof B2Error) return e.message;
  if (e instanceof DocFormatError) return e.message;
  return e instanceof Error ? e.message : "Lỗi không xác định.";
}

/** In a browser a failed request is either the network (offline, a firewall
 *  blocking B2) or a missing CORS rule; the browser hides which. A no-cors
 *  request to the same host tells them apart: it succeeds unless the host is
 *  unreachable. */
export async function explainNetworkError(
  cfg: B2Config,
): Promise<{ kind: "cors" | "network"; text: string }> {
  if (isNativeApp())
    return { kind: "network", text: "Không kết nối được tới B2. Kiểm tra mạng rồi thử lại." };
  const ep = parseEndpoint(cfg.endpoint);
  let reachable = false;
  if (ep) {
    try {
      await fetch(`https://${ep.host}/`, { mode: "no-cors", cache: "no-store" });
      reachable = true;
    } catch {
      reachable = false;
    }
  }
  return reachable
    ? {
        kind: "cors",
        text:
          `Bucket ${cfg.bucket} chưa cho phép trang ${location.origin} truy cập (thiếu quy tắc CORS). ` +
          "Làm theo hướng dẫn “Bật truy cập cho bản web” bên dưới — chỉ cần làm một lần.",
      }
    : {
        kind: "network",
        text: `Không tới được ${ep?.host ?? "B2"}: máy đang mất mạng, hoặc mạng (ví dụ tường lửa công ty) chặn Backblaze. Thử mạng khác, hoặc dùng app trên điện thoại.`,
      };
}

/** Error text for the UI; a missing CORS rule also opens the CORS helper. */
async function messageFor(e: unknown, cfg: B2Config): Promise<string> {
  if (!(e instanceof B2Error && e.kind === "network")) return describeB2Error(e);
  const why = await explainNetworkError(cfg);
  if (why.kind === "cors") useB2.setState({ cors: { cfg, origin: location.origin, autoFailed: false } });
  return why.text;
}

async function run<T>(
  label: string,
  fn: (c: B2Client, cfg: B2Config) => Promise<T>,
  opts: { keepMessage?: boolean } = {},
): Promise<T | undefined> {
  const cfg = useB2.getState().config;
  if (!cfg) {
    useB2.setState({ message: { kind: "error", text: "Chưa kết nối Backblaze B2." } });
    return undefined;
  }
  useB2.setState(opts.keepMessage ? { busy: label } : { busy: label, message: null });
  try {
    return await fn(client(cfg), cfg);
  } catch (e) {
    useB2.setState({ message: { kind: "error", text: await messageFor(e, cfg) } });
    return undefined;
  } finally {
    useB2.setState({ busy: null });
  }
}

// ---------- operations ----------

/** Test the credentials, then remember them on this device. */
export async function connectB2(cfg: B2Config): Promise<boolean> {
  const full = { ...cfg, prefix: normalizePrefix(cfg.prefix || DEFAULT_PREFIX) };
  useB2.setState({ busy: "Đang kiểm tra kết nối…", message: null });
  try {
    await client(full).test();
    saveB2Config(full);
    useB2.setState({
      config: full,
      cors: null,
      message: { kind: "info", text: `Đã kết nối bucket ${full.bucket}.` },
    });
    await refreshB2();
    return true;
  } catch (e) {
    useB2.setState({ message: { kind: "error", text: await messageFor(e, full) } });
    return false;
  } finally {
    useB2.setState({ busy: null });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let corsRetryDelayMs = 3000;
/** Tests shorten the wait for B2 to apply new CORS rules. */
export function _setCorsRetryDelay(ms: number): void {
  corsRetryDelayMs = ms;
}

/** Add the MathPad CORS rule for this page's address to the bucket, using a
 *  key that may change bucket settings (e.g. the Master Application Key).
 *  The key is used for this call only and never stored. Then connect again. */
export async function enableCorsFromApp(admin: { keyId: string; appKey: string }): Promise<boolean> {
  const need = useB2.getState().cors;
  if (!need) return false;
  useB2.setState({ busy: "Đang bật truy cập cho bản web…", message: null });
  try {
    await setMathpadCors({
      keyId: admin.keyId.trim(),
      appKey: admin.appKey.trim(),
      bucketName: need.cfg.bucket,
      origins: [need.origin],
    });
  } catch (e) {
    const network = (e as { code?: string }).code === "network";
    useB2.setState({
      busy: null,
      cors: { ...need, autoFailed: need.autoFailed || network },
      message: {
        kind: "error",
        text: network
          ? "Trình duyệt không cho trang này tự đổi cài đặt bucket (hoặc mạng chặn Backblaze). Dùng cách 2 bên dưới."
          : describeCorsError(e),
      },
    });
    return false;
  }
  // B2 can take a few seconds to apply the new rule.
  useB2.setState({ busy: "Đã bật. Đang kết nối lại…" });
  for (let i = 0; i < 4; i++) {
    await sleep(i === 0 ? 300 : corsRetryDelayMs);
    try {
      await client(need.cfg).test();
      return connectB2(need.cfg);
    } catch {
      /* not applied yet */
    }
  }
  useB2.setState({
    busy: null,
    message: {
      kind: "info",
      text: "Đã bật truy cập cho bản web. Backblaze có thể cần một phút để áp dụng: tải lại trang rồi bấm Kết nối.",
    },
  });
  return false;
}

function describeCorsError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.startsWith("Đăng nhập B2"))
    return "Backblaze không nhận khóa này. Kiểm tra lại keyID và applicationKey của Master Application Key.";
  if (/không có quyền sửa bucket/.test(msg))
    return "Khóa này không được phép đổi cài đặt bucket. Dùng Master Application Key (xem hướng dẫn ở trên).";
  if (/Không tìm thấy bucket/.test(msg))
    return `${msg} Kiểm tra tên bucket, và khóa phải thuộc đúng tài khoản Backblaze đó.`;
  return msg;
}

export function disconnectB2(): void {
  saveB2Config(null);
  saveSyncState({});
  useB2.setState({
    config: null,
    files: null,
    savedAt: null,
    cors: null,
    message: { kind: "info", text: "Đã ngắt kết nối B2." },
  });
}

export async function refreshB2(): Promise<void> {
  // Keeps the last message (e.g. "Đã lưu…") visible while the list reloads.
  await run(
    "Đang tải danh sách…",
    async (c) => {
      const files = (await c.list()).sort((a, b) => b.lastModified.localeCompare(a.lastModified));
      useB2.setState({ files });
    },
    { keepMessage: true },
  );
}

/** Upload one document; removes its previous key if the title changed. */
async function uploadDoc(c: B2Client, doc: Doc, state: SyncState, replaces?: string): Promise<void> {
  const key = docKey(c.prefix, doc);
  const etag = await c.put(key, serializeDoc(doc), "application/json");
  const old = replaces ?? (state[doc.id]?.key !== key ? state[doc.id]?.key : undefined);
  if (old && old !== key) await c.remove(old).catch(() => undefined);
  state[doc.id] = { key, etag, updatedAt: doc.updatedAt };
}

/** Save the open document to B2 (Ctrl+S). */
export async function saveCurrentToB2(): Promise<boolean> {
  const result = await run("Đang lưu lên B2…", async (c) => {
    const doc = useDocStore.getState().doc;
    await putDoc(doc).catch(() => false);
    const state = loadSyncState();
    await uploadDoc(c, doc, state);
    saveSyncState(state);
    useB2.setState({ savedAt: new Date(), message: { kind: "info", text: "Đã lưu bài lên B2." } });
    return true;
  });
  await refreshB2();
  return result === true;
}

/** Upload any file (e.g. an export) into the MathPad folder. */
export async function uploadFileToB2(blob: Blob, name: string): Promise<boolean> {
  const result = await run("Đang tải tệp lên…", async (c) => {
    await c.put(`${c.prefix}${name}`, blob, blob.type || "application/octet-stream");
    useB2.setState({ message: { kind: "info", text: `Đã lưu ${name} lên B2.` } });
    return true;
  });
  await refreshB2();
  return result === true;
}

/** Open a remote file: MathPad documents and .tex files become the open document. */
export async function openFromB2(key: string): Promise<Doc | null> {
  const doc = await run("Đang mở…", async (c) => {
    const text = await c.getText(key);
    if (key.endsWith(DOC_SUFFIX)) {
      const d = parseDocText(text);
      const state = loadSyncState();
      const r = useB2.getState().files?.find((f) => f.key === key);
      state[d.id] = { key, etag: r?.etag ?? "", updatedAt: d.updatedAt };
      saveSyncState(state);
      return d;
    }
    if (/\.(tex|ltx)$/i.test(key)) {
      const { doc: d } = importTex(text);
      if (!d.title)
        d.title = key
          .split("/")
          .pop()!
          .replace(/\.(tex|ltx)$/i, "");
      return d;
    }
    throw new DocFormatError("Chỉ mở được .mathpad.json hoặc .tex; tệp khác hãy dùng “Tải về”.");
  });
  if (!doc) return null;
  await putDoc(doc).catch(() => false);
  return doc;
}

export async function downloadFromB2(key: string): Promise<Blob | null> {
  return (await run("Đang tải về…", (c) => c.getBlob(key))) ?? null;
}

export async function deleteFromB2(key: string): Promise<void> {
  await run("Đang xóa…", async (c) => {
    await c.remove(key);
    const id = docIdFromKey(key);
    if (id) {
      const state = loadSyncState();
      delete state[id];
      saveSyncState(state);
    }
    useB2.setState({ message: { kind: "info", text: "Đã xóa trên B2." } });
  });
  await refreshB2();
}

const sameContent = (a: Doc, b: Doc) =>
  a.title === b.title && JSON.stringify(a.lines) === JSON.stringify(b.lines);

/** Two-way sync between the on-device library and B2. Never deletes; when both
 *  sides changed, both versions are kept (the B2 one as a copy). */
export async function syncLibraryWithB2(): Promise<{ up: number; down: number; conflicts: number } | null> {
  const result = await run("Đang đồng bộ…", async (c) => {
    try {
      await putDoc(useDocStore.getState().doc);
    } catch {
      /* library unavailable */
    }
    const local = (await listDocs()).map((e) => e.doc);
    const remote = await c.list();
    const state = loadSyncState();
    const actions = planSync(local, remote, state, c.prefix);
    const byId = new Map(local.map((d) => [d.id, d]));
    const etagOf = (key: string) => remote.find((r) => r.key === key)?.etag ?? "";
    let up = 0;
    let down = 0;
    let conflicts = 0;
    for (const a of actions) {
      if (a.type === "upload") {
        await uploadDoc(c, byId.get(a.id)!, state, a.replaces);
        up++;
      } else if (a.type === "download") {
        const d = parseDocText(await c.getText(a.key));
        await putDoc(d);
        state[d.id] = { key: a.key, etag: etagOf(a.key), updatedAt: d.updatedAt };
        down++;
      } else {
        const mine = byId.get(a.id)!;
        const theirs = parseDocText(await c.getText(a.key));
        if (sameContent(mine, theirs)) {
          state[a.id] = { key: a.key, etag: etagOf(a.key), updatedAt: mine.updatedAt };
          continue;
        }
        const copy: Doc = {
          ...theirs,
          id: newId(),
          title: `${theirs.title || "Không tiêu đề"} (bản trên B2)`,
        };
        await putDoc(copy);
        await uploadDoc(c, mine, state, a.key);
        conflicts++;
      }
    }
    saveSyncState(state);
    // The open document may have been updated from B2.
    const open = useDocStore.getState().doc;
    const fresh = await getDoc(open.id).catch(() => null);
    if (fresh && fresh.updatedAt !== open.updatedAt) useDocStore.getState().loadDoc(fresh);
    const text =
      up + down + conflicts === 0
        ? "Thư viện và B2 đã khớp."
        : `Đồng bộ xong: ${up} bài lên B2, ${down} bài về máy${conflicts ? `, ${conflicts} bài sửa ở cả hai nơi (đã giữ cả hai bản)` : ""}.`;
    useB2.setState({ message: { kind: "info", text } });
    return { up, down, conflicts };
  });
  await refreshB2();
  return result ?? null;
}
