// Editing commands shared by the menu bar, the icon toolbar and shortcuts.
// They act on the line that has (or last had) the focus.
import type { MathfieldElement } from "mathlive";
import { fromDisplay, toDisplay } from "../core/displayLatex";
import { useDocStore } from "../core/docStore";

const lineEl = (id: string) => document.querySelector<HTMLElement>(`[data-line-id="${CSS.escape(id)}"]`);

/** The line commands act on: the focused one, else the last line. */
export function currentLineId(): string {
  const st = useDocStore.getState();
  const id = st.focusedLineId;
  return id && st.doc.lines.some((l) => l.id === id) ? id : st.doc.lines[st.doc.lines.length - 1].id;
}

/** Push the line's live editor value into the store before a line action. */
export function syncLine(id: string): void {
  const el = lineEl(id);
  if (!el) return;
  const value =
    el.tagName === "MATH-FIELD"
      ? fromDisplay((el as MathfieldElement).getValue("latex"))
      : (el as HTMLTextAreaElement).value;
  useDocStore.getState().updateLine(id, value);
}

function onLine(run: (id: string) => void): () => void {
  return () => {
    const id = currentLineId();
    syncLine(id);
    run(id);
  };
}

const st = () => useDocStore.getState();
const indexOf = (id: string) => st().doc.lines.findIndex((l) => l.id === id);

export const lineCommands = {
  addMath: onLine((id) => void st().insertLineAfter(id, "math")),
  addText: onLine((id) => void st().insertLineAfter(id, "text")),
  addJoined: onLine((id) => void st().insertLineAfter(id, "math", { joinPrev: true })),
  toggleType: onLine((id) => st().toggleType(id)),
  /** Join with the line above (one aligned block when exported), or split again. */
  toggleJoin: onLine((id) => {
    const line = st().doc.lines.find((l) => l.id === id);
    if (line && indexOf(id) > 0) st().setJoinPrev(id, !line.joinPrev);
  }),
  moveUp: onLine((id) => st().moveLine(id, indexOf(id) - 1)),
  moveDown: onLine((id) => st().moveLine(id, indexOf(id) + 1)),
  duplicate: onLine((id) => void st().duplicateLine(id)),
  remove: onLine((id) => st().deleteLine(id)),
  undo: () => void st().undo(),
  redo: () => void st().redo(),
};

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

/** Insert LaTeX at the caret of the current math line (a new math line when
 *  the current line is text). `#@` takes the selection, `#?` is a placeholder. */
export async function insertMath(latex: string): Promise<void> {
  let id = currentLineId();
  syncLine(id);
  if (st().doc.lines.find((l) => l.id === id)?.type !== "math") {
    id = st().insertLineAfter(id, "math");
  }
  let mf: MathfieldElement | null = null;
  for (let i = 0; i < 30 && !mf; i++) {
    const el = lineEl(id);
    if (el?.tagName === "MATH-FIELD") mf = el as MathfieldElement;
    else await nextFrame();
  }
  if (!mf) return;
  mf.focus();
  mf.insert(toDisplay(latex), { format: "latex", selectionMode: "placeholder" });
  st().updateLine(id, fromDisplay(mf.getValue("latex")));
}

/** Give the keyboard back to the current line after a menu command. */
export function refocusEditor(): void {
  requestAnimationFrame(() => lineEl(currentLineId())?.focus());
}
