// Minimal Google Drive v3 REST client (fetch only).
import { DocFormatError, FILE_MIME, parseDocText } from "../core/docFormat";
import type { Doc } from "../core/types";

export type DriveErrorKind = "auth" | "denied" | "not_found" | "quota" | "network" | "format" | "other";

export class DriveError extends Error {
  constructor(
    message: string,
    readonly kind: DriveErrorKind,
    readonly status = 0,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

export interface TokenProvider {
  get: () => Promise<string>;
  invalidate: () => void;
}

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FIELDS = "id,name,modifiedTime";

async function errorFrom(res: Response): Promise<DriveError> {
  let reason = "";
  let message = "";
  try {
    const data = (await res.json()) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    };
    reason = data.error?.errors?.[0]?.reason ?? "";
    message = data.error?.message ?? "";
  } catch {
    /* ignore */
  }
  if (res.status === 401) return new DriveError("Phiên đăng nhập Google đã hết hạn.", "auth", 401);
  if (res.status === 404)
    return new DriveError("Không tìm thấy file trên Drive (có thể đã bị xóa).", "not_found", 404);
  if (reason === "storageQuotaExceeded" || reason === "quotaExceeded")
    return new DriveError("Google Drive đã hết dung lượng.", "quota", res.status);
  if (res.status === 403)
    return new DriveError(
      "Không có quyền truy cập file này trên Drive." + (message ? ` (${message})` : ""),
      "denied",
      403,
    );
  return new DriveError(`Lỗi Google Drive (${res.status}) ${message}`.trim(), "other", res.status);
}

export function createDriveApi(tokens: TokenProvider, fetchImpl: typeof fetch = fetch) {
  /** fetch with bearer token; on 401 refresh the token once and retry. */
  async function call(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await tokens.get();
      let res: Response;
      try {
        res = await fetchImpl(url, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
        });
      } catch {
        throw new DriveError("Mất kết nối mạng, chưa lưu/mở được với Google Drive.", "network");
      }
      if (res.status === 401 && attempt === 0) {
        tokens.invalidate();
        continue;
      }
      if (!res.ok) throw await errorFrom(res);
      return res;
    }
    throw new DriveError("Phiên đăng nhập Google đã hết hạn.", "auth", 401);
  }

  function multipartBody(
    metadata: Record<string, unknown>,
    content: string | Blob,
    mime: string,
  ): { body: Blob; contentType: string } {
    const boundary = `mathpad-${Math.random().toString(36).slice(2)}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ]);
    return { body, contentType: `multipart/related; boundary=${boundary}` };
  }

  return {
    async createFile(name: string, content: string | Blob, mime: string = FILE_MIME): Promise<DriveFile> {
      const { body, contentType } = multipartBody({ name, mimeType: mime }, content, mime);
      const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      });
      return (await res.json()) as DriveFile;
    },

    async updateFile(fileId: string, content: string, name?: string): Promise<DriveFile> {
      const metadata = name ? { name } : {};
      const { body, contentType } = multipartBody(metadata, content, FILE_MIME);
      const res = await call(
        `${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=${FIELDS}`,
        { method: "PATCH", headers: { "Content-Type": contentType }, body },
      );
      return (await res.json()) as DriveFile;
    },

    async downloadFile(fileId: string): Promise<Doc> {
      const res = await call(`${API}/files/${encodeURIComponent(fileId)}?alt=media`);
      const text = await res.text();
      try {
        return parseDocText(text);
      } catch (e) {
        if (e instanceof DocFormatError) throw new DriveError(e.message, "format");
        throw e;
      }
    },

    async getAccountName(): Promise<string> {
      const res = await call(`${API}/about?fields=user(displayName,emailAddress)`);
      const data = (await res.json()) as { user?: { displayName?: string; emailAddress?: string } };
      return data.user?.displayName || data.user?.emailAddress || "Google";
    },
  };
}

export type DriveApi = ReturnType<typeof createDriveApi>;
