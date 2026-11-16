// Google Picker restricted to MathPad documents.
import { FILE_EXTENSION, FILE_MIME } from "../core/docFormat";
import { getAccessToken } from "./auth";
import { googleConfig, loadScript } from "./config";

interface PickerDoc {
  id: string;
  name?: string;
}
interface PickerResponse {
  action: string;
  docs?: PickerDoc[];
}
interface PickerBuilder {
  addView: (view: unknown) => PickerBuilder;
  setOAuthToken: (t: string) => PickerBuilder;
  setDeveloperKey: (k: string) => PickerBuilder;
  setAppId: (id: string) => PickerBuilder;
  setTitle: (t: string) => PickerBuilder;
  setLocale: (l: string) => PickerBuilder;
  setCallback: (cb: (r: PickerResponse) => void) => PickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
}
interface DocsView {
  setMimeTypes: (m: string) => DocsView;
  setQuery: (q: string) => DocsView;
  setMode: (m: unknown) => DocsView;
}
interface PickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: unknown) => DocsView;
  ViewId: { DOCS: unknown };
  DocsViewMode: { LIST: unknown };
  Action: { PICKED: string; CANCEL: string };
}
interface Gapi {
  load: (lib: string, cb: { callback: () => void; onerror: () => void }) => void;
}

declare global {
  interface Window {
    gapi?: Gapi;
  }
}

let pickerReady: Promise<void> | null = null;

function loadPicker(): Promise<void> {
  if (!pickerReady) {
    pickerReady = loadScript("https://apis.google.com/js/api.js").then(
      () =>
        new Promise<void>((resolve, reject) => {
          window.gapi?.load("picker", { callback: resolve, onerror: () => reject(new Error("picker")) });
        }),
    );
    pickerReady.catch(() => {
      pickerReady = null;
    });
  }
  return pickerReady;
}

/** Open the Picker; resolve to the chosen file id, or null if cancelled. */
export async function pickFile(): Promise<string | null> {
  const cfg = googleConfig();
  if (!cfg) throw new Error("Chưa cấu hình Google Drive.");
  const [token] = await Promise.all([getAccessToken(), loadPicker()]);
  const picker = (window.google as unknown as { picker: PickerNamespace }).picker;
  const view = new picker.DocsView(picker.ViewId.DOCS)
    .setMimeTypes(FILE_MIME)
    .setQuery(FILE_EXTENSION)
    .setMode(picker.DocsViewMode.LIST);
  return new Promise((resolve) => {
    let builder = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setTitle("Mở tài liệu MathPad")
      .setLocale("vi")
      .setCallback((r) => {
        if (r.action === picker.Action.PICKED) resolve(r.docs?.[0]?.id ?? null);
        else if (r.action === picker.Action.CANCEL) resolve(null);
      });
    if (cfg.apiKey) builder = builder.setDeveloperKey(cfg.apiKey);
    if (cfg.appId) builder = builder.setAppId(cfg.appId);
    builder.build().setVisible(true);
  });
}
