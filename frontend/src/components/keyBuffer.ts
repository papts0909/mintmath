// MathLive moves focus ~60 ms after focus() is called. Keys typed in that
// window still reach the previously focused line. They are buffered here and
// replayed into the line the document store says is focused.
import { useDocStore } from "../core/docStore";

let buffer: { lineId: string; text: string } | null = null;

/** Should a key event that reached `lineId` be redirected? If so, buffer it. */
export function interceptStrayKey(lineId: string, e: React.KeyboardEvent): boolean {
  const target = useDocStore.getState().focusedLineId;
  if (!target || target === lineId) return false;
  if (e.nativeEvent.isComposing) return false;
  const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
  if (printable) {
    if (!buffer || buffer.lineId !== target) buffer = { lineId: target, text: "" };
    buffer.text += e.key;
  }
  // Drop everything else (Enter, arrows…) while focus is in flight.
  return true;
}

/** Take buffered text destined for `lineId`. */
export function takeBuffered(lineId: string): string {
  if (!buffer || buffer.lineId !== lineId) return "";
  const t = buffer.text;
  buffer = null;
  return t;
}
