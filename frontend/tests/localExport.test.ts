import { describe, expect, it } from "vitest";
import { pageBreaks, printableLatex, renderPrintHtml, texFileName } from "../src/export/localExport";
import type { Doc } from "../src/core/types";

describe("localExport", () => {
  it("rewrites augmented matrices for the static renderer and drops placeholders", () => {
    expect(
      printableLatex("\\left[\\begin{array}{cc|c}1&2&3\\end{array}\\right]+\\frac{\\placeholder{}}{2}"),
    ).toBe("\\begin{bmatrix}\\begin{array}{cc|c}1&2&3\\end{array}\\end{bmatrix}+\\frac{{}}{2}");
    expect(printableLatex("\\left\\lbrack\\begin{array}{c|c}a&b\\end{array}\\right\\rbrack")).toBe(
      "\\begin{bmatrix}\\begin{array}{c|c}a&b\\end{array}\\end{bmatrix}",
    );
  });

  it("renders title, text and grouped math blocks with escaped text", () => {
    const doc: Doc = {
      version: 1,
      id: "d",
      title: "Bài <1>",
      updatedAt: "",
      lines: [
        { id: "a", type: "text", content: "x < y & z" },
        { id: "b", type: "math", content: "a=b" },
        { id: "c", type: "math", content: "=c", joinPrev: true },
        { id: "d", type: "math", content: "" },
        { id: "e", type: "text", content: "" },
      ],
    };
    const html = renderPrintHtml(doc);
    expect(html).toContain("<h1>Bài &lt;1&gt;</h1>");
    expect(html).toContain("<p>x &lt; y &amp; z</p>");
    expect(html.match(/class="math-block"/g)).toHaveLength(1);
    expect(html.match(/class="math-row"/g)).toHaveLength(2);
    expect(html).toContain('<p class="gap"></p>');
  });

  it("names files after the title", () => {
    expect(texFileName("Bài 1")).toBe("Bài_1.tex");
    expect(texFileName("")).toBe("mintmath.tex");
  });
});

describe("pageBreaks", () => {
  it("keeps everything on one page when it fits", () => {
    expect(pageBreaks([{ top: 0, bottom: 100 }], 100, 1000)).toEqual([0]);
  });

  it("breaks before a block that would cross the page bottom", () => {
    const blocks = [
      { top: 0, bottom: 400 },
      { top: 420, bottom: 900 },
      { top: 920, bottom: 1100 },
      { top: 1120, bottom: 1500 },
    ];
    expect(pageBreaks(blocks, 1500, 1000)).toEqual([0, 920]);
  });

  it("cuts a block taller than a page", () => {
    expect(pageBreaks([{ top: 0, bottom: 2500 }], 2500, 1000)).toEqual([0, 1000, 2000]);
  });
});
