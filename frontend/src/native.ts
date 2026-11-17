// Running inside the Android app (Capacitor) rather than a browser.
import { Capacitor } from "@capacitor/core";

/** Running in the desktop app (Tauri: .dmg / .exe). */
export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Android or desktop app: no print dialog, no service worker. */
export function isNativeApp(): boolean {
  if (Capacitor.isNativePlatform() || isDesktopApp()) return true;
  // Dev-only switch so the app-specific UI can be exercised in a browser.
  return (
    import.meta.env.DEV &&
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).has("native")
  );
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Không đọc được dữ liệu"));
    reader.readAsDataURL(blob);
  });

/** Android: write the file to the app cache and open the share sheet, from
 *  which the user saves it (Files, a cloud app) or sends it (Zalo, Gmail…). */
export async function shareFileNative(blob: Blob, filename: string): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const safeName = filename.replace(/[\\/:*?"<>|]/g, "_");
  const { uri } = await Filesystem.writeFile({
    path: safeName,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ title: safeName, files: [uri], dialogTitle: `Lưu hoặc gửi ${safeName}` });
  } catch (e) {
    // Closing the share sheet without choosing is not an error.
    if (!(e instanceof Error) || !/cancel/i.test(e.message)) throw e;
  }
}

/** Desktop: native "Save as" dialog, then write the file. */
export async function saveFileDesktop(blob: Blob, filename: string): Promise<void> {
  const [{ save }, { writeFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".") + 1) : "";
  const path = await save({
    defaultPath: filename,
    filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined,
  });
  if (!path) return; // cancelled
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}
