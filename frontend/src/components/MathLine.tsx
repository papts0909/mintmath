import { useEffect, useRef } from "react";
import { MathfieldElement } from "mathlive";
import "mathlive/fonts.css";
import { fromDisplay, toDisplay } from "../core/displayLatex";
import { inlineShortcutMap } from "../core/shortcuts";
import type { Line } from "../core/types";
import type { FocusEdge } from "../core/docStore";
import { interceptStrayKey, takeBuffered } from "./keyBuffer";
import { isCoarsePointer, setupVirtualKeyboard } from "./touch";
import {
  commaInStructure,
  maybeAutoSubscript,
  semicolonInStructure,
  tabInStructure,
  undoSkippingProbes,
} from "./mathfieldTools";

// Fonts and sounds are served by Vite from node_modules/mathlive.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<React.HTMLAttributes<MathfieldElement>, MathfieldElement>;
    }
  }
}

export type MoveDirection = "forward" | "backward" | "upward" | "downward";

export interface LineKeyContext {
  /** True when the line's editor is empty. */
  isEmpty: boolean;
  /** Let the field handle undo/redo itself. */
  fieldUndo: (redo: boolean) => void;
  /** Push the field's current value to the store. */
  sync: () => void;
}

interface Props {
  line: Line;
  focused: boolean;
  focusNonce: number;
  focusEdge: FocusEdge;
  autoSubscript: boolean;
  onChange: (content: string) => void;
  onFocus: () => void;
  /** Return true if the key was handled at the document level. */
  onKey: (e: React.KeyboardEvent, ctx: LineKeyContext) => boolean;
  onMoveOut: (dir: MoveDirection) => void;
  onPasteText: (text: string) => boolean;
}

const SHORTCUTS = inlineShortcutMap();

/** mf.focus() defers the real focus by ~60 ms; focusing the keyboard sink
 *  directly is synchronous, so no keystroke goes astray. */
function focusNow(mf: MathfieldElement): void {
  if (document.activeElement === mf) return;
  const sink = mf.shadowRoot?.querySelector<HTMLElement>("[part=keyboard-sink]");
  if (sink) sink.focus();
  else mf.focus();
}

export default function MathLine(props: Props) {
  const { line, focused, focusNonce, focusEdge } = props;
  const ref = useRef<MathfieldElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // One-time setup.
  useEffect(() => {
    const mf = ref.current;
    if (!mf) return;
    // On touch screens show MathLive's on-screen keyboard (with the MathPad layout).
    setupVirtualKeyboard();
    mf.mathVirtualKeyboardPolicy = isCoarsePointer() ? "auto" : "manual";
    mf.inlineShortcuts = { ...mf.inlineShortcuts, ...SHORTCUTS };
    mf.inlineShortcutTimeout = 0;
    mf.smartFence = true;
    mf.menuItems = [];
    mf.setValue(toDisplay(propsRef.current.line.content), { silenceNotifications: true });

    // Inline shortcuts may rewrite the formula after the input event fired, so
    // sync again on the next frame and when the field loses focus.
    const sync = () => propsRef.current.onChange(fromDisplay(mf.getValue("latex")));
    let frame = 0;
    const onInput = () => {
      sync();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    const onMoveOut = (e: Event) => {
      e.preventDefault();
      const dir = (e as CustomEvent<{ direction: MoveDirection }>).detail.direction;
      propsRef.current.onMoveOut(dir);
    };
    const onFocusIn = () => propsRef.current.onFocus();
    mf.addEventListener("input", onInput);
    mf.addEventListener("move-out", onMoveOut);
    mf.addEventListener("focusin", onFocusIn);
    mf.addEventListener("focusout", sync);
    return () => {
      cancelAnimationFrame(frame);
      mf.removeEventListener("focusout", sync);
      mf.removeEventListener("input", onInput);
      mf.removeEventListener("move-out", onMoveOut);
      mf.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  // External content changes (undo, load) -> field.
  useEffect(() => {
    const mf = ref.current;
    if (mf && fromDisplay(mf.getValue("latex")) !== line.content) {
      mf.setValue(toDisplay(line.content), { silenceNotifications: true });
    }
  }, [line.content]);

  // Focus requests.
  useEffect(() => {
    const mf = ref.current;
    if (!mf || !focused) return;
    // A freshly mounted field may not accept focus synchronously; retry briefly.
    let tries = 0;
    let timer = 0;
    const isActive = () => document.activeElement === mf;
    const apply = () => {
      if (!mf.isConnected) return;
      if (!isActive() && tries === 0) {
        focusNow(mf);
        mf.position = focusEdge === "start" ? 0 : mf.lastOffset;
      }
      if (!isActive() && tries++ < 40) {
        timer = window.setTimeout(apply, 10);
        return;
      }
      const pending = takeBuffered(propsRef.current.line.id);
      if (pending) {
        mf.executeCommand(["typedText", pending, { simulateKeystroke: true }]);
        propsRef.current.onChange(fromDisplay(mf.getValue("latex")));
      }
    };
    apply();
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce]);

  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    const mf = ref.current;
    if (!mf) return;
    const p = propsRef.current;
    if (interceptStrayKey(p.line.id, e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const ctx: LineKeyContext = {
      isEmpty: mf.getValue("latex").trim() === "",
      fieldUndo: (redo) => undoSkippingProbes(mf, redo),
      sync: () => p.onChange(fromDisplay(mf.getValue("latex"))),
    };
    if (p.onKey(e, ctx)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    let handled = false;
    if (plain && e.key === ",") handled = commaInStructure(mf);
    else if (plain && e.key === ";") handled = semicolonInStructure(mf);
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "Tab") {
      handled = tabInStructure(mf, e.shiftKey);
    } else if (plain && /^\d$/.test(e.key) && p.autoSubscript) {
      handled = maybeAutoSubscript(mf, e.key);
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "z" || e.key === "Z" || e.key === "y")) {
      undoSkippingProbes(mf, e.key === "y" || e.shiftKey);
      handled = true;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      p.onChange(fromDisplay(mf.getValue("latex")));
    }
  };

  const onPasteCapture = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (text && propsRef.current.onPasteText(text)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      className="math-line"
      onKeyDownCapture={onKeyDownCapture}
      onPasteCapture={onPasteCapture}
      onPointerDown={() => {
        if (ref.current) focusNow(ref.current);
      }}
    >
      <math-field ref={ref} data-line-id={line.id} aria-label="Dòng toán" />
    </div>
  );
}
