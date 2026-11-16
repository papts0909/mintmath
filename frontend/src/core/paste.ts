import type { Line } from "./types";

/** Split pasted text into document lines. Lines wrapped in $...$, $$...$$ or
 *  \[...\] become math lines; everything else becomes text. Blank lines are dropped. */
export function splitPastedText(text: string): Omit<Line, "id">[] {
  const out: Omit<Line, "id">[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const s = raw.trim();
    if (!s) continue;
    const m = /^\$\$([\s\S]*)\$\$$/.exec(s) ?? /^\\\[([\s\S]*)\\\]$/.exec(s) ?? /^\$([\s\S]*)\$$/.exec(s);
    if (m && m[1].trim()) out.push({ type: "math", content: m[1].trim() });
    else out.push({ type: "text", content: s });
  }
  return out;
}

export function isMultiLine(text: string): boolean {
  return /\r|\n/.test(text.trim());
}

/** Text placed on the clipboard when lines are copied. A single math line copies
 *  its raw LaTeX; several lines copy in a form `splitPastedText` reads back. */
export function linesToClipboard(lines: Line[]): string {
  if (lines.length === 1) return lines[0].content;
  return lines.map((l) => (l.type === "math" ? `$${l.content}$` : l.content)).join("\n");
}
