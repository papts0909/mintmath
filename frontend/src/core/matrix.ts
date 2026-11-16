// LaTeX helpers for multi-row structures (cases, matrices, augmented matrices).

export type EnvKind = "cases" | "bmatrix" | "pmatrix" | "vmatrix" | "augmented";

export const PLACEHOLDER = "\\placeholder{}";

/** Build an environment with empty placeholder cells.
 *  For `augmented`, the vertical rule goes before the last column. */
export function buildEnv(kind: EnvKind, rows: number, cols: number): string {
  const r = Math.max(1, Math.floor(rows));
  const c = Math.max(1, Math.floor(cols));
  const row = Array.from({ length: c }, () => PLACEHOLDER).join("&");
  const body = Array.from({ length: r }, () => row).join("\\\\");
  if (kind === "augmented") {
    const spec = c > 1 ? "c".repeat(c - 1) + "|c" : "c";
    return `\\left[\\begin{array}{${spec}}${body}\\end{array}\\right]`;
  }
  return `\\begin{${kind}}${body}\\end{${kind}}`;
}

export const MULTIROW_ENVS = new Set([
  "cases",
  "rcases",
  "dcases",
  "matrix",
  "bmatrix",
  "Bmatrix",
  "pmatrix",
  "vmatrix",
  "Vmatrix",
  "smallmatrix",
  "array",
  "aligned",
  "gathered",
  "split",
]);

export interface CellLocation {
  env: string;
  /** Column spec for `array` (e.g. "ccc|c"), else null. */
  spec: string | null;
  row: number;
  col: number;
  rows: number;
  /** Number of cells in each row. */
  rowCols: number[];
  /** Index of `\begin`. */
  beginIndex: number;
  /** Index where the body starts (after `\begin{env}` and an optional `{spec}`). */
  bodyStart: number;
  /** Index of `\end{env}`. */
  bodyEnd: number;
  /** Index right after the closing `\end{...}`. */
  endIndex: number;
}

interface Frame {
  env: string;
  spec: string | null;
  beginIndex: number;
  bodyStart: number;
  braceDepth: number;
  row: number;
  col: number;
  rowCols: number[];
  markerRow: number;
  markerCol: number;
}

const BEGIN_RE = /^\\begin\{([A-Za-z*]+)\}/;
const END_RE = /^\\end\{([A-Za-z*]+)\}/;

function readGroup(s: string, i: number): [string, number] | null {
  if (s[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === "{") depth++;
    else if (s[j] === "}") {
      depth--;
      if (depth === 0) return [s.slice(i + 1, j), j + 1];
    }
  }
  return null;
}

/** Find the innermost multi-row environment containing index `pos` of `latex`
 *  and the (row, col) of that position inside it. */
export function locateCell(latex: string, pos: number): CellLocation | null {
  const stack: Frame[] = [];
  let braceDepth = 0;
  let found: Frame | null = null;
  let i = 0;
  while (i <= latex.length) {
    if (i === pos && !found) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (MULTIROW_ENVS.has(stack[k].env)) {
          found = stack[k];
          found.markerRow = found.row;
          found.markerCol = found.col;
          break;
        }
      }
      if (!found) return null;
    }
    if (i >= latex.length) break;
    const ch = latex[i];
    if (ch === "\\") {
      const rest = latex.slice(i);
      const b = BEGIN_RE.exec(rest);
      if (b) {
        let bodyStart = i + b[0].length;
        let spec: string | null = null;
        if (b[1] === "array") {
          const g = readGroup(latex, bodyStart);
          if (g) {
            spec = g[0];
            bodyStart = g[1];
          }
        }
        stack.push({
          env: b[1],
          spec,
          beginIndex: i,
          bodyStart,
          braceDepth,
          row: 0,
          col: 0,
          rowCols: [],
          markerRow: -1,
          markerCol: -1,
        });
        // The marker may sit right inside the body (e.g. an empty first cell).
        i = pos > i && pos < bodyStart ? pos : bodyStart;
        continue;
      }
      const e = END_RE.exec(rest);
      if (e) {
        const f = stack.pop();
        if (f) {
          f.rowCols.push(f.col + 1);
          if (f === found) {
            return {
              env: f.env,
              spec: f.spec,
              row: f.markerRow,
              col: f.markerCol,
              rows: f.rowCols.length,
              rowCols: f.rowCols,
              beginIndex: f.beginIndex,
              bodyStart: f.bodyStart,
              bodyEnd: i,
              endIndex: i + e[0].length,
            };
          }
        }
        i += e[0].length;
        continue;
      }
      const top = stack[stack.length - 1];
      if (latex[i + 1] === "\\" && top && top.braceDepth === braceDepth) {
        top.rowCols.push(top.col + 1);
        top.row++;
        top.col = 0;
      }
      i += 2;
      continue;
    }
    if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth--;
    else if (ch === "&") {
      const top = stack[stack.length - 1];
      if (top && top.braceDepth === braceDepth) top.col++;
    }
    i++;
  }
  return null;
}

/** Split an environment body into rows of cells (top level only). */
export function splitCells(body: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "";
  let brace = 0;
  let env = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\") {
      const rest = body.slice(i);
      const b = BEGIN_RE.exec(rest);
      const e = END_RE.exec(rest);
      if (b) {
        env++;
        cell += b[0];
        i += b[0].length - 1;
        continue;
      }
      if (e) {
        env--;
        cell += e[0];
        i += e[0].length - 1;
        continue;
      }
      if (body[i + 1] === "\\" && brace === 0 && env === 0) {
        rows[rows.length - 1].push(cell);
        rows.push([]);
        cell = "";
        i++;
        continue;
      }
      cell += ch + (body[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === "{") brace++;
    if (ch === "}") brace--;
    if (ch === "&" && brace === 0 && env === 0) {
      rows[rows.length - 1].push(cell);
      cell = "";
      continue;
    }
    cell += ch;
  }
  rows[rows.length - 1].push(cell);
  return rows;
}

/** Number of columns described by an array spec such as "ccc|c". */
export function specColumns(spec: string): number {
  return (spec.match(/[lcr]/g) ?? []).length;
}

/** Insert a column into an array spec after column `afterCol` (0-based). The
 *  vertical rule keeps the same number of columns after it, so typing past the
 *  last column of an augmented matrix [A|b] grows A and keeps b on the right. */
export function insertSpecColumn(spec: string, afterCol: number): string {
  const n = specColumns(spec);
  const lastBar = spec.lastIndexOf("|");
  if (afterCol >= n - 1 && lastBar >= 0) {
    return spec.slice(0, lastBar) + "c" + spec.slice(lastBar);
  }
  let seen = 0;
  for (let i = 0; i < spec.length; i++) {
    if (/[lcr]/.test(spec[i])) {
      if (seen === afterCol) return spec.slice(0, i + 1) + "c" + spec.slice(i + 1);
      seen++;
    }
  }
  return spec + "c";
}

/** Rewrite the environment located by `loc` with a new empty column after
 *  `loc.col`. Returns the new LaTeX and the index of the new placeholder in the
 *  cursor's row. */
export function addColumn(latex: string, loc: CellLocation): { latex: string; placeholderIndex: number } {
  const body = latex.slice(loc.bodyStart, loc.bodyEnd);
  const rows = splitCells(body);
  const width = Math.max(...rows.map((r) => r.length), loc.spec ? specColumns(loc.spec) : 0);
  const newRows = rows.map((r) => {
    const cells = [...r];
    while (cells.length < width) cells.push("");
    cells.splice(loc.col + 1, 0, PLACEHOLDER);
    return cells;
  });
  const spec = loc.spec !== null ? insertSpecColumn(loc.spec, loc.col) : null;
  let out = latex.slice(0, loc.beginIndex) + `\\begin{${loc.env}}` + (spec !== null ? `{${spec}}` : "");
  let placeholderIndex = -1;
  newRows.forEach((cells, r) => {
    if (r > 0) out += "\\\\";
    cells.forEach((c, k) => {
      if (k > 0) out += "&";
      if (r === loc.row && k === loc.col + 1) placeholderIndex = out.length;
      out += c;
    });
  });
  out += latex.slice(loc.bodyEnd);
  return { latex: out, placeholderIndex };
}

/** Count `\placeholder` occurrences before index `end`. */
export function countPlaceholders(latex: string, end: number): number {
  return (latex.slice(0, end).match(/\\placeholder(?![A-Za-z])/g) ?? []).length;
}
