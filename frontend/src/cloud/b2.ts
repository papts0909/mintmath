// Backblaze B2 through its S3-compatible API. Each user connects their own
// account with an application key; nothing is stored on any MathPad server.
import { AwsClient } from "aws4fetch";

export interface B2Config {
  /** Application key ID (S3 "access key id"). */
  keyId: string;
  /** Application key (S3 "secret access key"). */
  appKey: string;
  bucket: string;
  /** S3 endpoint shown on the bucket page, e.g. s3.us-west-004.backblazeb2.com */
  endpoint: string;
  /** Folder inside the bucket used by MathPad, ending with "/". */
  prefix: string;
}

export interface RemoteObject {
  key: string;
  size: number;
  lastModified: string;
  etag: string;
}

export type B2ErrorKind = "auth" | "bucket" | "not_found" | "network" | "config" | "other";

export class B2Error extends Error {
  constructor(
    message: string,
    readonly kind: B2ErrorKind,
    readonly status = 0,
  ) {
    super(message);
    this.name = "B2Error";
  }
}

export const DEFAULT_PREFIX = "mathpad/";

/** "https://s3.us-west-004.backblazeb2.com/" -> host + region, or null if invalid. */
export function parseEndpoint(input: string): { host: string; region: string } | null {
  const host = input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  const m = /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/.exec(host);
  return m ? { host, region: m[1] } : null;
}

export function normalizePrefix(prefix: string): string {
  const p = prefix.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return p ? `${p}/` : "";
}

/** Check the form before trying to connect. Returns an error message or null. */
export function validateConfig(cfg: B2Config): string | null {
  if (!cfg.keyId.trim()) return "Thiếu keyID.";
  if (!cfg.appKey.trim()) return "Thiếu applicationKey.";
  if (!/^[a-z0-9][a-z0-9-]{4,48}[a-z0-9]$/i.test(cfg.bucket.trim())) return "Tên bucket không hợp lệ.";
  if (!parseEndpoint(cfg.endpoint))
    return "Endpoint phải có dạng s3.<vùng>.backblazeb2.com (xem trang chi tiết bucket).";
  return null;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

function textOf(el: Element, tag: string): string {
  return el.getElementsByTagName(tag)[0]?.textContent ?? "";
}

async function errorFrom(res: Response): Promise<B2Error> {
  let code = "";
  let message = "";
  try {
    const xml = new DOMParser().parseFromString(await res.text(), "application/xml");
    code = xml.getElementsByTagName("Code")[0]?.textContent ?? "";
    message = xml.getElementsByTagName("Message")[0]?.textContent ?? "";
  } catch {
    /* non-XML body */
  }
  if (
    res.status === 401 ||
    res.status === 403 ||
    /InvalidAccessKeyId|SignatureDoesNotMatch|AccessDenied/.test(code)
  ) {
    return new B2Error(
      "B2 từ chối khóa: kiểm tra keyID / applicationKey và quyền của khóa trên bucket này.",
      "auth",
      res.status,
    );
  }
  if (code === "NoSuchBucket") return new B2Error("Không tìm thấy bucket trên B2.", "bucket", res.status);
  if (res.status === 404 || code === "NoSuchKey")
    return new B2Error("Không tìm thấy tệp trên B2.", "not_found", 404);
  return new B2Error(`Lỗi B2 (${res.status}) ${message || code}`.trim(), "other", res.status);
}

export function createB2Client(cfg: B2Config, fetchImpl: FetchLike) {
  const ep = parseEndpoint(cfg.endpoint);
  if (!ep) throw new B2Error("Endpoint B2 không hợp lệ.", "config");
  const aws = new AwsClient({
    accessKeyId: cfg.keyId.trim(),
    secretAccessKey: cfg.appKey.trim(),
    service: "s3",
    region: ep.region,
  });
  const base = `https://${ep.host}/${encodeURIComponent(cfg.bucket.trim())}`;
  const objectUrl = (key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

  /** Sign, then send with the platform's fetch (plain url + init, which every
   *  fetch implementation accepts, including Tauri's and Capacitor's). */
  async function send(method: string, url: string, body?: BodyInit, headers: Record<string, string> = {}) {
    const signed = await aws.sign(url, { method, body, headers });
    const signedHeaders: Record<string, string> = {};
    signed.headers.forEach((v, k) => {
      signedHeaders[k] = v;
    });
    let res: Response;
    try {
      res = await fetchImpl(signed.url, { method, headers: signedHeaders, body });
    } catch {
      throw new B2Error("Không kết nối được tới B2.", "network");
    }
    if (!res.ok) throw await errorFrom(res);
    return res;
  }

  return {
    prefix: normalizePrefix(cfg.prefix),

    /** All objects under the MathPad prefix. */
    async list(): Promise<RemoteObject[]> {
      const out: RemoteObject[] = [];
      let token: string | null = null;
      do {
        const q = new URLSearchParams({
          "list-type": "2",
          prefix: normalizePrefix(cfg.prefix),
          "max-keys": "1000",
        });
        if (token) q.set("continuation-token", token);
        const res = await send("GET", `${base}?${q.toString()}`);
        const xml = new DOMParser().parseFromString(await res.text(), "application/xml");
        for (const c of Array.from(xml.getElementsByTagName("Contents"))) {
          out.push({
            key: textOf(c, "Key"),
            size: Number(textOf(c, "Size")) || 0,
            lastModified: textOf(c, "LastModified"),
            etag: textOf(c, "ETag").replace(/"/g, ""),
          });
        }
        token =
          textOf(xml.documentElement, "IsTruncated") === "true"
            ? textOf(xml.documentElement, "NextContinuationToken")
            : null;
      } while (token);
      return out;
    },

    /** Check key, bucket and (in a browser) CORS with a 1-item listing. */
    async test(): Promise<void> {
      const q = new URLSearchParams({
        "list-type": "2",
        "max-keys": "1",
        prefix: normalizePrefix(cfg.prefix),
      });
      await send("GET", `${base}?${q.toString()}`);
    },

    async getText(key: string): Promise<string> {
      return (await send("GET", objectUrl(key))).text();
    },

    async getBlob(key: string): Promise<Blob> {
      return (await send("GET", objectUrl(key))).blob();
    },

    /** Upload; returns the new ETag (without quotes) when the server exposes it. */
    async put(key: string, body: string | Blob, contentType: string): Promise<string> {
      const res = await send("PUT", objectUrl(key), body, { "content-type": contentType });
      return (res.headers.get("etag") ?? "").replace(/"/g, "");
    },

    async remove(key: string): Promise<void> {
      await send("DELETE", objectUrl(key));
    },
  };
}

export type B2Client = ReturnType<typeof createB2Client>;
