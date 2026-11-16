// Import a LaTeX file into a MathPad document.
//
// Round-trips MathPad's own .tex export exactly (title, text lines, display
// math, joined align* rows, empty text lines) and reads common hand-written
// LaTeX: \section/\title, paragraphs, \[ \], $$ $$, equation/align/gather/
// multline (rows become joined lines), itemize/enumerate, simple text macros.
// A paragraph that mixes text and inline math ($…$ or \(…\)) becomes one math
// line with the text parts wrapped in \text{…}, so the formula stays editable.
import { DOC_VERSION, type Doc, type Line } from "./types";
import { newId } from "./id";
import { emptyLine } from "./docFormat";

type NewLine = Omit<Line, "id">;

const DISPLAY_ENVS = [
  "equation",
  "equation*",
  "align",
  "align*",
  "aligned",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
  "displaymath",
  "math",
];
const ROW_ENVS = new Set([
  "align",
  "align*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
]);

/** Remove `%` comments (not `\%`). */
export function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "\\") {
          i++;
          continue;
        }
        if (line[i] === "%") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function findGroupEnd(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/** Read `\cmd{arg}` (optionally `\cmd*{arg}`) starting at `i`; returns [arg, end]. */
function readArg(s: string, i: number): [string, number] | null {
  let k = i;
  while (k < s.length && /\s/.test(s[k])) k++;
  if (s[k] === "[") {
    const close = s.indexOf("]", k);
    if (close < 0) return null;
    k = close + 1;
    while (k < s.length && /\s/.test(s[k])) k++;
  }
  if (s[k] !== "{") return null;
  const end = findGroupEnd(s, k);
  if (end < 0) return null;
  return [s.slice(k + 1, end), end + 1];
}

/** Undo MathPad's text escaping and drop simple formatting macros. */
export function unescapeText(s: string): string {
  let out = s
    .replace(/\\textbackslash\{\}/g, "\uE000")
    .replace(/\\textasciicircum\{\}/g, "^")
    .replace(/\\textasciitilde\{\}/g, "\uE001")
    .replace(/\\(?:textbf|textit|emph|underline|textrm|textsf|texttt|text|mbox)\{([^{}]*)\}/g, "$1")
    .replace(/\\([{}$&#_%])/g, "$1")
    .replace(/\\ldots\b|\\dots\b/g, "…")
    .replace(/\\(?:quad|qquad|,|;|:| )\s*/g, " ")
    .replace(/(^|[^\\])~/g, "$1 ")
    .replace(/``|''/g, '"')
    .replace(/---/g, "—")
    .replace(/--/g, "–");
  out = out.replace(/\uE000/g, "\\").replace(/\uE001/g, "~");
  return out.replace(/[ \t]+/g, " ").trim();
}

/** Split an environment body into rows at top-level `\\`. */
export function splitRows(body: string): string[] {
  const rows: string[] = [];
  let depth = 0;
  let env = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "\\") {
      if (body.startsWith("\\begin{", i)) env++;
      else if (body.startsWith("\\end{", i)) env--;
      if (body[i + 1] === "\\" && depth === 0 && env === 0) {
        rows.push(cur);
        cur = "";
        i++;
        // optional spacing argument: \\[2pt]
        if (body[i + 1] === "[") {
          const close = body.indexOf("]", i + 1);
          if (close > 0) i = close;
        }
        continue;
      }
      cur += ch + (body[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    cur += ch;
  }
  rows.push(cur);
  return rows
    .map((r) => r.replace(/\\(?:label|tag|nonumber|notag)\b(\{[^}]*\})?/g, "").trim())
    .filter(Boolean);
}

/** True if `&` appears outside nested environments/groups. */
function hasTopLevelAmp(s: string): boolean {
  let depth = 0;
  let env = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") {
      if (s.startsWith("\\begin{", i)) env++;
      else if (s.startsWith("\\end{", i)) env--;
      i++;
      continue;
    }
    if (s[i] === "{") depth++;
    else if (s[i] === "}") depth--;
    else if (s[i] === "&" && depth === 0 && env === 0) return true;
  }
  return false;
}

function mathRows(rows: string[]): NewLine[] {
  // MathPad's export prefixes rows that have no alignment of their own with
  // "& " (ampersand + space). Hand-written align blocks put & mid-row
  // ("a &= b"); then leading ampersands are real alignment and are kept.
  const handAligned = rows.some((r) => hasTopLevelAmp(r.trim().replace(/^&\s*/, "")));
  return rows.map((row, k) => {
    let content = row.trim();
    if (!handAligned && /^& \S/.test(content)) content = content.slice(2);
    const line: NewLine = { type: "math", content };
    if (k > 0) line.joinPrev = true;
    return line;
  });
}

/** Turn a paragraph with inline math into lines. */
function paragraphLines(par: string): NewLine[] {
  // Protect escaped dollars so they are not taken for inline math.
  const text = par
    .replace(/\s*\n\s*/g, " ")
    .trim()
    .replace(/\\\$/g, "\uE002");
  if (!text) return [];
  const restore = (t: string) => t.replace(/\uE002/g, "$");
  // Split at inline math: $…$ or \(…\)
  const parts: { math: boolean; s: string }[] = [];
  const re = /\$([^$]+)\$|\\\(([\s\S]+?)\\\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ math: false, s: text.slice(last, m.index) });
    parts.push({ math: true, s: (m[1] ?? m[2]).trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ math: false, s: text.slice(last) });
  if (!parts.some((p) => p.math)) return [{ type: "text", content: restore(unescapeText(text)) }];
  if (parts.length === 1) return [{ type: "math", content: restore(parts[0].s) }];
  const content = parts
    .map((p) => {
      if (p.math) return p.s;
      const t = unescapeText(p.s.replace(/^\s/, "\u00a0").replace(/\s$/, "\u00a0")).replace(/\u00a0/g, " ");
      return t ? `\\text{${p.s.startsWith(" ") ? " " : ""}${restore(t)}${p.s.endsWith(" ") ? " " : ""}}` : "";
    })
    .join("");
  return [{ type: "math", content }];
}

export interface TexImportResult {
  doc: Doc;
  /** Things that were skipped, for a notice to the user. */
  skipped: string[];
}

export function importTex(source: string): TexImportResult {
  const skipped = new Set<string>();
  let src = stripComments(source.replace(/\r\n?/g, "\n"));

  let title = "";
  const titleMatch = /\\title\s*\{/.exec(src);
  if (titleMatch) {
    const arg = readArg(src, titleMatch.index + "\\title".length);
    if (arg) title = unescapeText(arg[0]);
  }
  const begin = src.indexOf("\\begin{document}");
  if (begin >= 0) {
    src = src.slice(begin + "\\begin{document}".length);
    const end = src.indexOf("\\end{document}");
    if (end >= 0) src = src.slice(0, end);
  }
  src = src.replace(/\\maketitle\b/g, "");

  const lines: NewLine[] = [];
  let par = "";
  const flushPar = () => {
    for (const p of par.split(/\n\s*\n/)) lines.push(...paragraphLines(p));
    par = "";
  };

  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);

    // Sectioning: first one becomes the title if there is none.
    const sec = /^\\(section|subsection|subsubsection|chapter|paragraph)\*?/.exec(rest);
    if (sec) {
      const arg = readArg(src, i + sec[0].length);
      if (arg) {
        flushPar();
        const heading = unescapeText(arg[0]);
        if (!title && !lines.length) title = heading;
        else lines.push({ type: "text", content: heading });
        i = arg[1];
        continue;
      }
    }

    // Display math \[ … \]
    if (rest.startsWith("\\[")) {
      const end = src.indexOf("\\]", i + 2);
      if (end > 0) {
        flushPar();
        const body = src.slice(i + 2, end).trim();
        if (body) lines.push({ type: "math", content: body });
        i = end + 2;
        continue;
      }
    }
    // Display math $$ … $$
    if (rest.startsWith("$$")) {
      const end = src.indexOf("$$", i + 2);
      if (end > 0) {
        flushPar();
        const body = src.slice(i + 2, end).trim();
        if (body) lines.push({ type: "math", content: body });
        i = end + 2;
        continue;
      }
    }

    const env = /^\\begin\{([A-Za-z*]+)\}/.exec(rest);
    if (env) {
      const name = env[1];
      const endTag = `\\end{${name}}`;
      const end = src.indexOf(endTag, i + env[0].length);
      if (end > 0) {
        const body = src.slice(i + env[0].length, end);
        if (DISPLAY_ENVS.includes(name)) {
          flushPar();
          const rows = ROW_ENVS.has(name) ? splitRows(body) : [body.replace(/\\label\{[^}]*\}/g, "").trim()];
          lines.push(...mathRows(rows.filter(Boolean)));
          i = end + endTag.length;
          continue;
        }
        if (name === "itemize" || name === "enumerate") {
          flushPar();
          const items = body.split(/\\item\b/).slice(1);
          items.forEach((item, k) => {
            const marker = name === "enumerate" ? `${k + 1}. ` : "• ";
            lines.push(...paragraphLines(marker + item.trim()));
          });
          i = end + endTag.length;
          continue;
        }
        if (name === "center" || name === "flushleft" || name === "flushright" || name === "quote") {
          // keep content, drop the wrapper
          src = src.slice(0, i) + body + src.slice(end + endTag.length);
          continue;
        }
      }
    }

    // Vertical space: MathPad writes \medskip for an empty text line.
    const skip = /^\\(medskip|bigskip|smallskip|null|newpage|clearpage|noindent|par)\b\s*/.exec(rest);
    if (skip) {
      flushPar();
      if (skip[1] === "medskip") lines.push({ type: "text", content: "" });
      i += skip[0].length;
      continue;
    }
    const vspace = /^\\vspace\*?\s*\{[^}]*\}/.exec(rest);
    if (vspace) {
      i += vspace[0].length;
      continue;
    }
    // Forced line break in text: new line.
    if (rest.startsWith("\\\\")) {
      flushPar();
      i += 2;
      continue;
    }
    // Preamble-like commands that can appear in fragments.
    const pre = /^\\(usepackage|documentclass|setmainfont|setlength|geometry|pagestyle|date|author)\b/.exec(
      rest,
    );
    if (pre) {
      let k = i + pre[0].length;
      for (let n = 0; n < 2; n++) {
        const a = readArg(src, k);
        if (!a) break;
        k = a[1];
      }
      skipped.add(`\\${pre[1]}`);
      i = k;
      continue;
    }

    par += src[i];
    i++;
  }
  flushPar();

  const docLines: Line[] = lines.map((l) => ({ ...l, id: newId() }));
  // A joined line cannot start the document.
  if (docLines[0]?.joinPrev) delete docLines[0].joinPrev;
  return {
    doc: {
      version: DOC_VERSION,
      id: newId(),
      title,
      lines: docLines.length ? docLines : [emptyLine()],
      updatedAt: new Date().toISOString(),
    },
    skipped: [...skipped],
  };
}
