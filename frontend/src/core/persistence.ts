import { parseDoc } from "./docFormat";
import type { Doc } from "./types";

export const STORAGE_KEY = "mathpad.doc.v1";
export const AUTOSAVE_DELAY_MS = 500;

export interface StoredState {
  doc: Doc;
}

export function saveLocal(state: StoredState, storage: Storage = localStorage): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal(storage: Storage = localStorage): StoredState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { doc?: unknown };
    const doc = parseDoc(data.doc);
    return { doc };
  } catch {
    return null;
  }
}

/** Debounced saver: call `schedule` on every change; it writes after `delay` ms of quiet. */
export function createAutosaver(
  write: () => void,
  delay = AUTOSAVE_DELAY_MS,
): { schedule: () => void; flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
      write();
    }
  };
  return {
    schedule: () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        write();
      }, delay);
    },
    flush,
    cancel: () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}

export interface Settings {
  autoSubscript: boolean;
  /** Handle IME (e.g. Vietnamese Telex) composition in math lines ourselves. */
  imeFix: boolean;
  theme: "system" | "light" | "dark";
}

export const SETTINGS_KEY = "mathpad.settings.v1";
export const DEFAULT_SETTINGS: Settings = { autoSubscript: true, imeFix: true, theme: "system" };

export function loadSettings(storage: Storage = localStorage): Settings {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const data = JSON.parse(raw) as Partial<Settings>;
    return {
      autoSubscript:
        typeof data.autoSubscript === "boolean" ? data.autoSubscript : DEFAULT_SETTINGS.autoSubscript,
      imeFix: typeof data.imeFix === "boolean" ? data.imeFix : DEFAULT_SETTINGS.imeFix,
      theme:
        data.theme === "light" || data.theme === "dark" || data.theme === "system"
          ? data.theme
          : DEFAULT_SETTINGS.theme,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings, storage: Storage = localStorage): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore: settings are a convenience */
  }
}
