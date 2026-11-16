import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importTex, splitRows, stripComments, unescapeText } from "../src/core/texImport";
import { buildTex } from "../src/core/texBuilder";
import type { Doc } from "../src/core/types";

const FIXTURES = join(__dirname, "../../backend/tests/fixtures");
const fixtures = readdirSync(FIXTURES).filter((f) => f.endsWith(".json"));
const load = (f: string) => JSON.parse(readFileSync(join(FIXTURES, f), "utf-8")) as Doc;
const view = (d: Doc) =>
  d.lines.map(({ type, content, joinPrev }) => ({ type, content, ...(joinPrev ? { joinPrev } : {}) }));

describe("importTex: MathPad's own export round-trips", () => {
  it.each(fixtures)("%s: export → import → export is stable", (f) => {
    const tex = buildTex(load(f));
    const back = importTex(tex).doc;
    const noIds = (t: string) => t.replace(/% line:\S+/g, "% line:");
    expect(noIds(buildTex(back))).toBe(noIds(tex));
  });

  it("restores lines, joined rows and the title of the sample", () => {
    const doc = load("sample.json");
    const back = importTex(buildTex(doc)).doc;
    expect(back.title).toBe(doc.title);
    expect(view(back)).toEqual(view(doc));
  });

  it("restores special characters in text", () => {
    const doc = load("special_text.json");
    const back = importTex(buildTex(doc)).doc;
    expect(back.lines[0].content).toBe(doc.lines[0].content);
    expect(back.lines[1].content).toBe(doc.lines[1].content);
  });
});

describe("importTex: hand-written LaTeX", () => {
  it("reads a typical exercise file", () => {
    const tex = String.raw`\documentclass{article}
\usepackage{amsmath}
\title{Bài tập 1}
\begin{document}
\maketitle
\section*{Câu 1}
Giải phương trình sau:   % ghi chú
\begin{equation}
x^2 - 5x + 6 = 0 \label{eq:1}
\end{equation}
Ta có
\begin{align*}
\Delta &= 25 - 24 \\
       &= 1
\end{align*}
Vậy $x = 2$ hoặc $x = 3$.

$$S=\{2;3\}$$
\begin{itemize}
\item Ý thứ nhất
\item Ý có $a+b$
\end{itemize}
\end{document}`;
    const { doc, skipped } = importTex(tex);
    expect(doc.title).toBe("Bài tập 1");
    expect(view(doc)).toEqual([
      { type: "text", content: "Câu 1" },
      { type: "text", content: "Giải phương trình sau:" },
      { type: "math", content: "x^2 - 5x + 6 = 0" },
      { type: "text", content: "Ta có" },
      { type: "math", content: "\\Delta &= 25 - 24" },
      { type: "math", content: "&= 1", joinPrev: true },
      { type: "math", content: "\\text{Vậy }x = 2\\text{ hoặc }x = 3\\text{.}" },
      { type: "math", content: "S=\\{2;3\\}" },
      { type: "text", content: "• Ý thứ nhất" },
      { type: "math", content: "\\text{• Ý có }a+b" },
    ]);
    expect(skipped).toEqual([]);
  });

  it("uses the first section as title when there is none and keeps later ones as text", () => {
    const { doc } = importTex("\\section{Đề}\nA\n\n\\section{Lời giải}\nB");
    expect(doc.title).toBe("Đề");
    expect(view(doc)).toEqual([
      { type: "text", content: "A" },
      { type: "text", content: "Lời giải" },
      { type: "text", content: "B" },
    ]);
  });

  it("handles fragments, inline \\( \\) and escaped dollars", () => {
    const { doc } = importTex("Giá 5\\$ và \\(x>0\\)\\\\\nDòng mới");
    expect(view(doc)).toEqual([
      { type: "math", content: "\\text{Giá 5$ và }x>0" },
      { type: "text", content: "Dòng mới" },
    ]);
  });

  it("returns one empty line for an empty file", () => {
    expect(view(importTex("").doc)).toEqual([{ type: "math", content: "" }]);
  });

  it("helpers", () => {
    expect(stripComments("a % b\nc \\% d % e")).toBe("a \nc \\% d ");
    expect(unescapeText("\\textbf{x} \\& y~z \\textbackslash{}")).toBe("x & y z \\");
    expect(splitRows("a&=b\\\\[2pt] \\begin{cases}x\\\\y\\end{cases} \\label{q}\\\\")).toEqual([
      "a&=b",
      "\\begin{cases}x\\\\y\\end{cases}",
    ]);
  });
});
