// Cursor-aware helpers on top of MathLive's public API.
import type { MathfieldElement } from "mathlive";
import {
  addColumn,
  countPlaceholders,
  locateCell,
  PLACEHOLDER,
  splitCells,
  type CellLocation,
} from "../core/matrix";

/** Temporary caret marker. Chosen because it is rare in school maths. */
export const PROBE_MARKER = "\\ddagger";

/** Find where the caret is inside a multi-row structure, or null.
 *  Inserts a marker at the caret (replacing a selected placeholder), reads the
 *  LaTeX, then undoes the insertion, which restores value and selection. */
export interface Probe {
  loc: CellLocation;
  /** LaTeX with the marker at the caret; `loc` indexes into this string. */
  withMarker: string;
  markerIndex: number;
  /** What the marker stands for when removed (a selected placeholder, or nothing). */
  restore: string;
}

export function probeCell(mf: MathfieldElement): Probe | null {
  const before = mf.getValue("latex");
  const selection = mf.selection;
  const collapsed = mf.selectionIsCollapsed;
  const markersBefore = before.split(PROBE_MARKER).length;
  mf.insert(PROBE_MARKER, { silenceNotifications: true, format: "latex" });
  const withMarker = mf.getValue("latex");
  mf.executeCommand("undo");
  if (mf.getValue("latex") !== before) {
    mf.setValue(before, { silenceNotifications: true });
    mf.selection = selection;
  }
  if (withMarker.split(PROBE_MARKER).length !== markersBefore + 1) return null;
  const idx = withMarker.lastIndexOf(PROBE_MARKER) >= 0 ? findNewMarker(withMarker) : -1;
  if (idx < 0) return null;
  // The marker may have replaced a selected placeholder; locate against the
  // marker-annotated string (the marker contains no structure characters).
  const loc = locateCell(withMarker, idx);
  if (!loc) return null;
  return { loc, withMarker, markerIndex: idx, restore: collapsed ? "" : PLACEHOLDER };
}

function findNewMarker(withMarker: string): number {
  // Pick the occurrence followed by a non-letter (a real \\ddagger token).
  let from = withMarker.length;
  for (;;) {
    const i = withMarker.lastIndexOf(PROBE_MARKER, from);
    if (i < 0) return -1;
    if (!/[A-Za-z]/.test(withMarker[i + PROBE_MARKER.length] ?? "")) return i;
    from = i - 1;
  }
}

function sameCell(a: CellLocation, b: CellLocation): boolean {
  return a.beginIndex === b.beginIndex && a.row === b.row && a.col === b.col;
}

/** Step the caret right until it lands in another cell of the same structure. */
function stepToCell(
  mf: MathfieldElement,
  start: CellLocation,
  accept: (loc: CellLocation) => boolean,
): boolean {
  const origin = mf.position;
  for (let i = 0; i < 400; i++) {
    if (!mf.executeCommand("moveToNextChar")) break;
    const p = probeCell(mf);
    if (!p) continue;
    if (p.loc.env === start.env && !sameCell(p.loc, start) && accept(p.loc)) {
      // Landed at the start of the cell; select it if it is an empty placeholder.
      const body = p.withMarker.slice(p.loc.bodyStart, p.loc.bodyEnd);
      const cell = splitCells(body)[p.loc.row]?.[p.loc.col] ?? "";
      if (cell.replace(PROBE_MARKER, "").trim() === "" && p.restore === "") {
        const here = mf.position;
        mf.executeCommand("moveToNextPlaceholder");
        if (mf.selectionIsCollapsed) mf.position = here;
      }
      return true;
    }
  }
  mf.position = origin;
  return false;
}

function selectNthPlaceholder(mf: MathfieldElement, n: number): void {
  mf.position = 0;
  for (let i = 0; i <= n; i++) mf.executeCommand("moveToNextPlaceholder");
}

/** `,` inside a matrix/array: go to the next cell, or add a column at the end
 *  of the row. Returns false when the key should be typed normally. */
export function commaInStructure(mf: MathfieldElement): boolean {
  const p = probeCell(mf);
  if (!p) return false;
  const { loc } = p;
  if (loc.env.endsWith("cases")) return false; // keep the plain comma in systems
  const cols = loc.rowCols[loc.row] ?? 1;
  if (loc.col < cols - 1) {
    return stepToCell(mf, loc, (l) => l.row === loc.row && l.col === loc.col + 1);
  }
  const res = addColumn(p.withMarker, loc);
  // Put back what the marker replaced. Indices before the marker may have
  // shifted (the array spec grows), so find the marker by occurrence count.
  const nth = p.withMarker.slice(0, p.markerIndex).split(PROBE_MARKER).length - 1;
  let at = -1;
  for (let k = 0; k <= nth; k++) at = res.latex.indexOf(PROBE_MARKER, at + 1);
  if (at < 0) return false;
  const latex = res.latex.slice(0, at) + p.restore + res.latex.slice(at + PROBE_MARKER.length);
  const phIndex =
    res.placeholderIndex + (res.placeholderIndex > at ? p.restore.length - PROBE_MARKER.length : 0);
  mf.setValue(latex);
  selectNthPlaceholder(mf, countPlaceholders(latex, phIndex));
  return true;
}

/** `;` inside a structure: go to the next row, or add a row at the end. */
export function semicolonInStructure(mf: MathfieldElement): boolean {
  const p = probeCell(mf);
  if (!p) return false;
  const { loc } = p;
  if (loc.row < loc.rows - 1) {
    return stepToCell(mf, loc, (l) => l.row === loc.row + 1 && l.col === 0);
  }
  // Move to the end of the current row first so the new row goes below it.
  return mf.executeCommand("addRowAfter");
}

/** Tab inside a structure: next cell (wrapping to the next row). */
export function tabInStructure(mf: MathfieldElement, backwards: boolean): boolean {
  const p = probeCell(mf);
  if (!p) return false;
  const { loc } = p;
  if (backwards) {
    return mf.executeCommand("moveToPreviousPlaceholder") || mf.executeCommand("moveToPreviousGroup");
  }
  return stepToCell(mf, loc, (l) => l.row > loc.row || (l.row === loc.row && l.col > loc.col));
}

/** Undo/redo while skipping the transient probe-marker states. */
export function undoSkippingProbes(mf: MathfieldElement, redo = false): void {
  const cmd = redo ? "redo" : "undo";
  const baseline = mf.getValue("latex").split(PROBE_MARKER).length;
  mf.executeCommand(cmd);
  for (let i = 0; i < 50 && mf.getValue("latex").split(PROBE_MARKER).length > baseline; i++) {
    if (!mf.executeCommand(cmd)) break;
  }
}

/** Auto-subscript: a single letter followed by a digit becomes letter_digit. */
export function maybeAutoSubscript(mf: MathfieldElement, digit: string): boolean {
  if (!/^\d$/.test(digit) || !mf.selectionIsCollapsed) return false;
  if (mf.mode !== "math") return false;
  const pos = mf.position;
  if (pos < 1) return false;
  const prev = mf.getValue(pos - 1, pos, "latex");
  if (!/^[A-Za-z]$/.test(prev)) return false;
  mf.executeCommand(["insert", `_{${digit}}`]);
  return true;
}
