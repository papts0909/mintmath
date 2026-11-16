import type { Doc } from "../core/types";

export type ExportKind = "tex" | "pdf" | "png";

export class ExportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly lineId: string | null = null,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

export interface ExportResult {
  blob: Blob;
  filename: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

/** Parse `filename*=UTF-8''...` (preferred) or `filename="..."`. */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : fallback;
}

async function errorFrom(res: Response): Promise<ExportError> {
  let message = `Lỗi máy chủ (${res.status})`;
  let lineId: string | null = null;
  try {
    const data = (await res.json()) as { message?: unknown; lineId?: unknown; detail?: unknown };
    if (typeof data.message === "string") message = data.message;
    else if (res.status === 422) message = "Tài liệu không đúng cấu trúc";
    if (typeof data.lineId === "string") lineId = data.lineId;
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 504) message = "Biên dịch quá thời gian cho phép (20 giây)";
  return new ExportError(message, res.status, lineId);
}

export async function exportDoc(
  kind: ExportKind,
  doc: Doc,
  opts: { dpi?: number; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<ExportResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const query = kind === "png" ? `?dpi=${opts.dpi ?? 200}` : "";
  let res: Response;
  try {
    res = await fetchImpl(`${API_BASE}/api/export/${kind}${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ExportError("Không kết nối được máy chủ xuất file. Kiểm tra mạng.", 0);
  }
  if (!res.ok) throw await errorFrom(res);
  const blob = await res.blob();
  const fallback = `mathpad.${kind === "png" && blob.type === "application/zip" ? "zip" : kind}`;
  return { blob, filename: filenameFromDisposition(res.headers.get("Content-Disposition"), fallback) };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
