import { isNativeApp } from "../native";
export interface GoogleConfig {
  clientId: string;
  apiKey: string;
  appId: string;
}

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export function googleConfig(): GoogleConfig | null {
  // Google blocks its sign-in page inside embedded WebViews (Android app).
  if (isNativeApp()) return null;
  const env = import.meta.env;
  const clientId = (env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";
  const apiKey = (env.VITE_GOOGLE_API_KEY as string | undefined) ?? "";
  const appId = (env.VITE_GOOGLE_APP_ID as string | undefined) ?? "";
  if (!clientId) return null;
  return { clientId, apiKey, appId };
}

/** Load an external script once. */
const loading = new Map<string, Promise<void>>();
export function loadScript(src: string): Promise<void> {
  const existing = loading.get(src);
  if (existing) return existing;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      loading.delete(src);
      reject(new Error(`Không tải được ${src}`));
    };
    document.head.appendChild(el);
  });
  loading.set(src, p);
  return p;
}
