// Service worker registration and the "install app" prompt.
import { create } from "zustand";
import { isNativeApp } from "./native";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  online: boolean;
  installEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  updateReady: boolean;
}

export const usePwa = create<PwaState>()(() => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  installEvent: null,
  installed:
    isNativeApp() ||
    (typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true)),
  updateReady: false,
}));

export const isIos = (): boolean =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export async function promptInstall(): Promise<void> {
  const ev = usePwa.getState().installEvent;
  if (!ev) return;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  usePwa.setState({ installEvent: null, installed: outcome === "accepted" });
}

export function setupPwa(): void {
  window.addEventListener("online", () => usePwa.setState({ online: true }));
  window.addEventListener("offline", () => usePwa.setState({ online: false }));
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    usePwa.setState({ installEvent: e as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => usePwa.setState({ installed: true, installEvent: null }));

  if (import.meta.env.PROD && "serviceWorker" in navigator && !isNativeApp()) {
    void import("virtual:pwa-register").then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onNeedRefresh: () => usePwa.setState({ updateReady: true }),
      });
    });
  }
}
