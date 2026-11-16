import { useEffect, useRef, useState } from "react";
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
  expandPendingShortcut,
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
  /** Handle Vietnamese/other IME composition ourselves (see effect below). */
  imeFix: boolean;
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
  const { line, focused, focusNonce, focusEdge, imeFix } = props;
  const ref = useRef<MathfieldElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  /** Text an input method (e.g. a Vietnamese IME on macOS) is still composing. */
  const [imeText, setImeText] = useState("");
  /** Letters typed in a row just before the caret (to recognise shortcut words). */
  const typedLetters = useRef("");

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

  // Input methods. Math input is plain ASCII, but a Vietnamese IME on macOS
  // (marked text) composes every keystroke. MathLive inserts a whole committed
  // string at once (so "1/2" breaks) and, in WebKit, also handles keystrokes
  // that belong to the composition (repeated characters). When imeFix is on:
  // composition never reaches MathLive; we preview it and replay the committed
  // text key by key. Listeners sit on the field's shadow root in the capture
  // phase: that is on the event path even when the browser does not let
  // composition events leave the shadow tree (WebKit), and runs before
  // MathLive's own listeners on its keyboard sink.
  useEffect(() => {
    const mf = ref.current;
    const root = mf?.shadowRoot;
    if (!mf || !root || !imeFix) return;
    const sink = () => root.querySelector<HTMLElement>("[part=keyboard-sink]");
    let composing = false;
    const commit = (text: string) => {
      const el = sink();
      if (el) el.textContent = "";
      if (!text) return;
      for (const ch of text) mf.executeCommand(["typedText", ch, { simulateKeystroke: true }]);
      typedLetters.current = /[A-Za-z]+$/.exec(text)?.[0] ?? "";
      if (expandPendingShortcut(mf, SHORTCUTS)) typedLetters.current = "";
      propsRef.current.onChange(fromDisplay(mf.getValue("latex")));
    };
    const onStart = (e: Event) => {
      e.stopPropagation();
      composing = true;
      setImeText("");
    };
    const onUpdate = (e: Event) => {
      e.stopPropagation();
      composing = true;
      setImeText((e as CompositionEvent).data ?? "");
    };
    const onEnd = (e: Event) => {
      e.stopPropagation();
      composing = false;
      setImeText("");
      commit((e as CompositionEvent).data ?? "");
    };
    const onKey = (e: Event) => {
      const ke = e as KeyboardEvent;
      // Keystrokes the IME is consuming: not for MathLive (no preventDefault,
      // the IME still needs them).
      if (composing || ke.isComposing || ke.keyCode === 229 || ke.key === "Process") e.stopPropagation();
    };
    const onInputEvent = (e: Event) => {
      const ie = e as InputEvent;
      if (composing || ie.isComposing || (ie.inputType ?? "").includes("Composition")) e.stopPropagation();
    };
    const opts = { capture: true } as const;
    root.addEventListener("compositionstart", onStart, opts);
    root.addEventListener("compositionupdate", onUpdate, opts);
    root.addEventListener("compositionend", onEnd, opts);
    root.addEventListener("keydown", onKey, opts);
    root.addEventListener("keypress", onKey, opts);
    root.addEventListener("beforeinput", onInputEvent, opts);
    root.addEventListener("input", onInputEvent, opts);
    return () => {
      root.removeEventListener("compositionstart", onStart, opts);
      root.removeEventListener("compositionupdate", onUpdate, opts);
      root.removeEventListener("compositionend", onEnd, opts);
      root.removeEventListener("keydown", onKey, opts);
      root.removeEventListener("keypress", onKey, opts);
      root.removeEventListener("beforeinput", onInputEvent, opts);
      root.removeEventListener("input", onInputEvent, opts);
      setImeText("");
    };
  }, [imeFix]);

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
    // Keys belonging to an IME composition are handled by the composition events.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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
    // Track the word being typed so Tab/Space can tell a shortcut just ended.
    const word = typedLetters.current;
    typedLetters.current = plain && /^[A-Za-z]$/.test(e.key) ? word + e.key : "";
    let handled = false;
    if (plain && !e.shiftKey && (e.key === "Tab" || e.key === " ") && word) {
      const endsWithShortcut = Object.keys(SHORTCUTS).some((t) => /^[A-Za-z]+$/.test(t) && word.endsWith(t));
      if (endsWithShortcut) {
        // MathLive may already have expanded it (first cell selected): Tab/Space
        // then just confirms and keeps the caret there. Otherwise expand now.
        handled = true;
        if (mf.selectionIsCollapsed) expandPendingShortcut(mf, SHORTCUTS);
      }
    }
    if (handled) {
      // fall through to the shared handled branch below
    } else if (plain && e.key === ",") handled = commaInStructure(mf);
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
      {imeText ? (
        <span className="ime-preview" aria-live="polite" title="Bộ gõ đang soạn">
          {imeText}
        </span>
      ) : null}
    </div>
  );
}
