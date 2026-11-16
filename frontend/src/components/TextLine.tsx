import { useEffect, useRef } from "react";
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

/** A single-line text input. A native <input> keeps Vietnamese IMEs
 *  (Telex/VNI and OS input methods) working without custom handling. */
export default function TextLine(props: Props) {
  const { line, focused, focusNonce, focusEdge } = props;
  const ref = useRef<HTMLInputElement>(null);

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

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    };
    if (props.onKey(e, ctx)) {
      e.preventDefault();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      props.onMoveOut("upward");
    } else if (e.key === "ArrowDown") {
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

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (text && props.onPasteText(text)) e.preventDefault();
  };

  return (
    <input
      ref={ref}
      className="text-line"
      type="text"
      value={line.content}
      data-line-id={line.id}
      aria-label="Dòng chữ"
      placeholder="Gõ chữ…"
      spellCheck={false}
      onChange={(e) => props.onChange(e.target.value)}
      onFocus={props.onFocus}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
  );
}
