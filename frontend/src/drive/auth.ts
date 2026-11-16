// Google Identity Services token flow. The access token lives in memory only.
import { DRIVE_SCOPE, googleConfig, loadScript } from "./config";

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }) => TokenClient;
  revoke: (token: string, done?: () => void) => void;
}

interface GoogleNamespace {
  accounts: { oauth2: GoogleOAuth2 };
}

declare global {
  interface Window {
    google?: GoogleNamespace & Record<string, unknown>;
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly kind: "denied" | "not_configured" | "network" | "other",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

let token: { value: string; expiresAt: number } | null = null;
let pending: Promise<string> | null = null;
let granted = false;
const listeners = new Set<(signedIn: boolean) => void>();

export function onAuthChange(fn: (signedIn: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  for (const fn of listeners) fn(token !== null);
}

export function isSignedIn(): boolean {
  return token !== null;
}

/** Forget the cached token (e.g. after a 401) so the next call asks again. */
export function invalidateToken(): void {
  token = null;
}

async function requestToken(interactive: boolean): Promise<string> {
  const cfg = googleConfig();
  if (!cfg)
    throw new AuthError("Chưa cấu hình Google Drive (thiếu VITE_GOOGLE_CLIENT_ID).", "not_configured");
  try {
    await loadScript(GIS_SRC);
  } catch {
    throw new AuthError("Không tải được dịch vụ đăng nhập Google. Kiểm tra mạng.", "network");
  }
  const oauth2 = window.google?.accounts.oauth2;
  if (!oauth2) throw new AuthError("Dịch vụ đăng nhập Google không khả dụng.", "other");
  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          const denied = resp.error === "access_denied";
          reject(
            new AuthError(
              denied
                ? "Bạn đã từ chối cấp quyền truy cập Google Drive."
                : (resp.error_description ?? "Đăng nhập thất bại."),
              denied ? "denied" : "other",
            ),
          );
          return;
        }
        const ttl = Number(resp.expires_in ?? 3600);
        token = { value: resp.access_token, expiresAt: Date.now() + ttl * 1000 };
        granted = true;
        emit();
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        const closed = err.type === "popup_closed" || err.type === "popup_failed_to_open";
        reject(
          new AuthError(
            closed ? "Cửa sổ đăng nhập đã bị đóng hoặc bị chặn." : (err.message ?? "Đăng nhập thất bại."),
            closed ? "denied" : "other",
          ),
        );
      },
    });
    client.requestAccessToken({ prompt: granted && !interactive ? "" : interactive ? "select_account" : "" });
  });
}

/** Return a valid access token, asking Google for a new one when needed. */
export function getAccessToken(opts: { interactive?: boolean } = {}): Promise<string> {
  if (token && token.expiresAt - Date.now() > 60_000) return Promise.resolve(token.value);
  if (!pending) {
    pending = requestToken(Boolean(opts.interactive)).finally(() => {
      pending = null;
    });
  }
  return pending;
}

export function signIn(): Promise<string> {
  token = null;
  return getAccessToken({ interactive: true });
}

export function signOut(): void {
  const current = token?.value;
  token = null;
  granted = false;
  emit();
  if (current) window.google?.accounts.oauth2.revoke(current);
}
