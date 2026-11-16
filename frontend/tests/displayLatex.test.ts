import { describe, expect, it } from "vitest";
import { fromDisplay, toDisplay } from "../src/core/displayLatex";

describe("displayLatex", () => {
  const stored = "A=\\left[\\begin{array}{ccc|c}1&1&2&3\\\\2&3&5&7\\end{array}\\right]";
  const shown = "A=\\begin{bmatrix}\\begin{array}{ccc|c}1&1&2&3\\\\2&3&5&7\\end{array}\\end{bmatrix}";

  it("maps augmented matrices both ways", () => {
    expect(toDisplay(stored)).toBe(shown);
    expect(fromDisplay(shown)).toBe(stored);
    expect(fromDisplay(toDisplay(stored))).toBe(stored);
  });

  it("accepts \\lbrack and MathLive spacing", () => {
    expect(toDisplay("\\left\\lbrack \\begin{array}{c|c}a & b\\end{array}\\right\\rbrack")).toBe(
      "\\begin{bmatrix}\\begin{array}{c|c}a & b\\end{array}\\end{bmatrix}",
    );
    expect(fromDisplay("\\begin{bmatrix} \\begin{array}{c|c}a\\end{array} \\end{bmatrix}")).toBe(
      "\\left[\\begin{array}{c|c}a\\end{array}\\right]",
    );
  });

  it("leaves other content alone", () => {
    for (const s of [
      "\\begin{bmatrix}1&2\\end{bmatrix}",
      "\\left[x\\right]",
      "\\begin{cases}a\\end{cases}",
    ]) {
      expect(toDisplay(s)).toBe(s);
      expect(fromDisplay(s)).toBe(s);
    }
  });

  it("handles several matrices in one line", () => {
    const two = `${stored}\\to${stored}`;
    expect(fromDisplay(toDisplay(two))).toBe(two);
  });
});
