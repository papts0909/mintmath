// Client-side port of backend/app/services/{normalize,tex_builder}.py so .tex
// export works offline. Both implementations are checked against the same
// golden files (backend/tests/golden/*.tex); keep them in sync.
import type { Doc, Line } from "./types";

export class TexLineError extends Error {
  constructor(
    message: string,
    readonly lineId: string | null = null,
  ) {
    super(message);
    this.name = "TexLineError";
  }
}

const FORBIDDEN_COMMANDS = [
  "input",
  "include",
  "includeonly",
  "write",
  "immediate",
  "openout",
  "openin",
  "read",
  "readline",
  "def",
  "edef",
  "gdef",
  "xdef",
  "let",
  "futurelet",
  "newcommand",
  "renewcommand",
  "providecommand",
  "DeclareRobustCommand",
  "catcode",
  "csname",
  "endcsname",
  "expandafter",
  "special",
  "usepackage",
  "RequirePackage",
  "documentclass",
  "directlua",
  "write18",
  "ShellEscape",
  "jobname",
  "endinput",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FORBIDDEN_RE = new RegExp(`\\\\(${FORBIDDEN_COMMANDS.map(escapeRe).join("|")})(?![A-Za-z])`);

const MACRO_MAP: Record<string, string> = {
  differentialD: "\\mathrm{d}",
  capitalDifferentialD: "\\mathrm{D}",
  exponentialE: "\\mathrm{e}",
  imaginaryI: "\\mathrm{i}",
  imaginaryJ: "\\mathrm{j}",
  mleft: "\\left",
  mright: "\\right",
  R: "\\mathbb{R}",
  N: "\\mathbb{N}",
  Z: "\\mathbb{Z}",
  Q: "\\mathbb{Q}",
  C: "\\mathbb{C}",
  doubleStruckCapitalR: "\\mathbb{R}",
  doubleStruckCapitalN: "\\mathbb{N}",
  doubleStruckCapitalZ: "\\mathbb{Z}",
  doubleStruckCapitalQ: "\\mathbb{Q}",
  doubleStruckCapitalC: "\\mathbb{C}",
  lbrace: "\\{",
  rbrace: "\\}",
};
const MACRO_RE = new RegExp(
  `\\\\(${Object.keys(MACRO_MAP)
    .sort((a, b) => b.length - a.length)
    .join("|")})(?![A-Za-z])`,
  "g",
);

function findGroupEnd(s: string, start: number): number {
  const opener = s[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new TexLineError("Thiếu dấu ngoặc đóng");
}

function stripPlaceholders(s: string): string {
  const token = "\\placeholder";
  let out = "";
  let i = 0;
  for (;;) {
    const j = s.indexOf(token, i);
    if (j < 0) {
      out += s.slice(i);
      break;
    }
    if (j + token.length < s.length && /[A-Za-z]/.test(s[j + token.length])) {
      out += s.slice(i, j + token.length);
      i = j + token.length;
      continue;
    }
    out += s.slice(i, j);
    let k = j + token.length;
    while (k < s.length && s[k] === " ") k++;
    if (k < s.length && s[k] === "[") k = findGroupEnd(s, k) + 1;
    while (k < s.length && s[k] === " ") k++;
    if (k < s.length && s[k] === "{") {
      const end = findGroupEnd(s, k);
      out += "{" + s.slice(k + 1, end) + "}";
      i = end + 1;
    } else {
      out += "{}";
      i = k;
    }
  }
  return out;
}

function countCols(rows: string): number {
  let depth = 0;
  let best = 1;
  let cols = 1;
  for (let i = 0; i < rows.length; i++) {
    const ch = rows[i];
    if (ch === "\\") {
      if (rows.startsWith("\\\\", i) && depth === 0) {
        best = Math.max(best, cols);
        cols = 1;
      }
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === "&" && depth === 0) cols++;
  }
  return Math.max(best, cols);
}

function augmentedArray(inner: string, after: number): string {
  const n = countCols(inner);
  const k = n > 1 ? Math.max(1, Math.min(after, n - 1)) : 0;
  const spec = "c".repeat(n - k) + (k ? "|" + "c".repeat(k) : "");
  return `\\left[\\begin{array}{${spec}}${inner}\\end{array}\\right]`;
}

function expandAugmented(s: string): string {
  const token = "\\augmented";
  for (;;) {
    const j = s.indexOf(token);
    if (j < 0) return s;
    const k = j + token.length;
    const bad = () => new TexLineError("Cú pháp \\augmented không hợp lệ");
    if (s[k] !== "{") throw bad();
    const e1 = findGroupEnd(s, k);
    const after = Number.parseInt(s.slice(k + 1, e1).trim(), 10);
    if (!/^\s*\d+\s*$/.test(s.slice(k + 1, e1))) throw bad();
    if (s[e1 + 1] !== "{") throw bad();
    const e2 = findGroupEnd(s, e1 + 1);
    const body = s.slice(e1 + 2, e2);
    const m = /^\s*\\begin\{[bpv]?matrix\}([\s\S]*)\\end\{[bpv]?matrix\}\s*$/.exec(body);
    const inner = m ? m[1] : body;
    s = s.slice(0, j) + augmentedArray(inner, after) + s.slice(e2 + 1);
  }
}

function fixArraySpecs(s: string): string {
  return s.replace(
    /\\begin\{array\}\{([clr|\s]+)\}/g,
    (_m, spec: string) => `\\begin{array}{${spec.replace(/\s+/g, "")}}`,
  );
}

export function checkSafe(latex: string): void {
  if (latex.includes("^^")) throw new TexLineError("Không cho phép chuỗi ^^ trong công thức");
  const m = FORBIDDEN_RE.exec(latex);
  if (m) throw new TexLineError(`Lệnh \\${m[1]} không được phép`);
}

function checkBalanced(s: string): void {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) throw new TexLineError("Thừa dấu ngoặc đóng }");
    }
  }
  if (depth) throw new TexLineError("Thiếu dấu ngoặc đóng }");
  const begins = [...s.matchAll(/\\begin\{([^}]*)\}/g)].map((m) => m[1]).sort();
  const ends = [...s.matchAll(/\\end\{([^}]*)\}/g)].map((m) => m[1]).sort();
  if (begins.join("\u0000") !== ends.join("\u0000")) {
    throw new TexLineError("\\begin và \\end không khớp");
  }
}

/** MathLive LaTeX -> compilable LaTeX; throws TexLineError on unsafe input. */
export function normalizeLatex(latex: string): string {
  checkSafe(latex);
  let s = latex.trim();
  s = stripPlaceholders(s);
  s = s.replace(MACRO_RE, (_m, name: string) => MACRO_MAP[name]);
  s = expandAugmented(s);
  s = fixArraySpecs(s);
  checkBalanced(s);
  checkSafe(s);
  return s.trim();
}

const TEXT_ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  $: "\\$",
  "&": "\\&",
  "#": "\\#",
  _: "\\_",
  "%": "\\%",
  "^": "\\textasciicircum{}",
  "~": "\\textasciitilde{}",
};

export function escapeText(text: string): string {
  return [...text].map((ch) => TEXT_ESCAPES[ch] ?? ch).join("");
}

/** Must match backend/app/templates/article.tex byte for byte. */
export const TEX_TEMPLATE = `\\documentclass[12pt,a4paper]{article}
\\usepackage[margin=2cm]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage{fontspec}
\\setmainfont{DejaVu Serif}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{4pt}
\\begin{document}
%%BODY%%
\\end{document}
`;

function mathOf(line: Line): string {
  try {
    return normalizeLatex(line.content);
  } catch (e) {
    if (e instanceof TexLineError) throw new TexLineError(e.message, line.id);
    throw e;
  }
}

function topLevel(tex: string): string {
  let out = "";
  let depth = 0;
  for (let i = 0; i < tex.length; i++) {
    if (tex.startsWith("\\begin{", i)) depth++;
    else if (tex.startsWith("\\end{", i)) depth--;
    if (depth === 0) out += tex[i];
  }
  return out;
}

export function buildBody(doc: Doc): string {
  const parts: string[] = [];
  if (doc.title.trim()) parts.push(`\\section*{${escapeText(doc.title.trim())}}`);
  const lines = doc.lines;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === "text") {
      parts.push(`% line:${line.id}`);
      const text = escapeText(line.content);
      parts.push(text.trim() ? text : "\\medskip");
      parts.push("");
      i++;
      continue;
    }
    const block = [line];
    let j = i + 1;
    while (j < lines.length && lines[j].type === "math" && lines[j].joinPrev) block.push(lines[j++]);
    i = j;
    const rendered = block.map((ln) => [ln, mathOf(ln)] as const).filter(([, tex]) => tex);
    if (!rendered.length) continue;
    if (rendered.length === 1) {
      const [ln, tex] = rendered[0];
      parts.push(`% line:${ln.id}`);
      parts.push(`\\[ ${tex} \\]`);
    } else {
      parts.push("\\begin{align*}");
      rendered.forEach(([ln, tex], k) => {
        parts.push(`% line:${ln.id}`);
        const sep = k < rendered.length - 1 ? " \\\\" : "";
        const body = topLevel(tex).includes("&") ? tex : "& " + tex;
        parts.push(body + sep);
      });
      parts.push("\\end{align*}");
    }
    parts.push("");
  }
  if (!parts.length) parts.push("\\null");
  return parts.join("\n");
}

export function buildTex(doc: Doc): string {
  return TEX_TEMPLATE.replace("%%BODY%%", buildBody(doc));
}
