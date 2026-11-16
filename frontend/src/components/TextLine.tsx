import { useEffect, useLayoutEffect, useRef } from "react";
import type { FocusEdge } from "../core/docStore";
import type { Line } from "../core/types";
import { interceptStrayKey, takeBuffered } from "./keyBuffer";
import type { LineKeyContext, MoveDirection } from "./MathLine";

interface Props {
  line: Line;
  focused: boolean;
  focusNonce: number;
  focusEdge: FocusEdge;
  onChange: (content: string) => void;
  onFocus: () => void;
  onKey: (e: React.KeyboardEvent, ctx: LineKeyContext) => boolean;
  onMoveOut: (dir: MoveDirection) => void;
  onPasteText: (text: string) => boolean;
}

/** A text line: a native <textarea> that wraps long text and grows with it.
 *  Native controls keep Vietnamese IMEs (Telex/VNI, OS input methods) working.
 *  Line breaks are not allowed inside a line: Enter creates a new line. */

function autoGrow(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** Is the caret on the first (or last) visual row of a wrapped textarea? */
function caretOnEdgeRow(el: HTMLTextAreaElement, edge: "top" | "bottom"): boolean {
  const style = getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3;
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  if (el.scrollHeight - padding <= lineHeight * 1.5) return true; // single row
  const pos = edge === "top" ? el.selectionStart : el.selectionEnd;
  // Measure the caret row with a mirror of the text before the caret.
  const mirror = document.createElement("div");
  for (const prop of [
    "font",
    "letterSpacing",
    "wordSpacing",
    "padding",
    "border",
    "boxSizing",
    "whiteSpace",
  ] as const) {
    mirror.style[prop] = style[prop];
  }
  mirror.style.width = `${el.clientWidth}px`;
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.textContent = el.value.slice(0, pos) + "\u200b";
  document.body.appendChild(mirror);
  const caretBottom = mirror.scrollHeight - parseFloat(style.paddingBottom);
  mirror.remove();
  const rows = Math.round((caretBottom - parseFloat(style.paddingTop)) / lineHeight);
  const totalRows = Math.round((el.scrollHeight - padding) / lineHeight);
  return edge === "top" ? rows <= 1 : rows >= totalRows;
}
export default function TextLine(props: Props) {
  const { line, focused, focusNonce, focusEdge } = props;
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (ref.current) autoGrow(ref.current);
  }, [line.content]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => autoGrow(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !focused) return;
    if (document.activeElement !== el) el.focus();
    const pos = focusEdge === "start" ? 0 : el.value.length;
    el.setSelectionRange(pos, pos);
    // Text inputs focus synchronously, but a math line may have buffered keys
    // for us while its own focus was still in flight.
    const timer = window.setTimeout(() => {
      const pending = takeBuffered(props.line.id);
      if (pending) {
        const at = el.selectionStart ?? el.value.length;
        props.onChange(el.value.slice(0, at) + pending + el.value.slice(at));
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Never steal keys while an IME is composing a character.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const el = e.currentTarget;
    if (interceptStrayKey(props.line.id, e)) {
      e.preventDefault();
      return;
    }
    const ctx: LineKeyContext = {
      isEmpty: el.value === "",
      fieldUndo: () => {
        /* let the browser's native input undo run */
      },
      sync: () => props.onChange(el.value),
    };
    if (props.onKey(e, ctx)) {
      e.preventDefault();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === "ArrowUp" && caretOnEdgeRow(el, "top")) {
      e.preventDefault();
      props.onMoveOut("upward");
    } else if (e.key === "ArrowDown" && caretOnEdgeRow(el, "bottom")) {
      e.preventDefault();
      props.onMoveOut("downward");
    } else if (e.key === "ArrowLeft" && el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault();
      props.onMoveOut("backward");
    } else if (
      e.key === "ArrowRight" &&
      el.selectionStart === el.value.length &&
      el.selectionEnd === el.value.length
    ) {
      e.preventDefault();
      props.onMoveOut("forward");
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (text && props.onPasteText(text)) e.preventDefault();
  };

  return (
    <textarea
      ref={ref}
      className="text-line"
      rows={1}
      value={line.content}
      data-line-id={line.id}
      aria-label="Dòng chữ"
      placeholder="Gõ chữ…"
      spellCheck={false}
      onChange={(e) => props.onChange(e.target.value.replace(/\r?\n/g, " "))}
      onFocus={props.onFocus}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
  );
}
