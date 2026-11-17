// Which colour theme the page uses. The default ("system") is the e-ink
// "Giấy" look, light or dark following the device's light/dark setting.
import type { Settings } from "./persistence";

export type ThemeChoice = Settings["theme"];
export type AppliedTheme = "light" | "dark" | "eink" | "eink-dark";

export const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "Giấy – theo hệ thống" },
  { value: "eink", label: "Giấy sáng" },
  { value: "eink-dark", label: "Giấy tối" },
  { value: "light", label: "Màu – sáng" },
  { value: "dark", label: "Màu – tối" },
];

const darkQuery = () => window.matchMedia?.("(prefers-color-scheme: dark)");

export function resolveTheme(choice: ThemeChoice, prefersDark = Boolean(darkQuery()?.matches)): AppliedTheme {
  if (choice !== "system") return choice;
  return prefersDark ? "eink-dark" : "eink";
}

/** Apply a theme choice now and keep following the device for "system".
 *  Returns a function that stops following. */
export function applyTheme(choice: ThemeChoice, root: HTMLElement = document.documentElement): () => void {
  const set = () => root.setAttribute("data-theme", resolveTheme(choice));
  set();
  if (choice !== "system") return () => {};
  const q = darkQuery();
  q?.addEventListener?.("change", set);
  return () => q?.removeEventListener?.("change", set);
}
