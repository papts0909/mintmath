import { describe, expect, it } from "vitest";
import { inlineShortcutMap, parseSizedTrigger } from "../src/core/shortcuts";

const rows = (latex: string) => latex.split("\\\\").length;
const cols = (latex: string) => latex.split("\\\\")[0].split("&").length;

describe("sized structure shortcuts", () => {
  it("defaults to the old sizes", () => {
    expect(rows(parseSizedTrigger("mat")!.latex)).toBe(2);
    expect(cols(parseSizedTrigger("mat")!.latex)).toBe(2);
    expect(rows(parseSizedTrigger("sys")!.latex)).toBe(2);
    expect(cols(parseSizedTrigger("amat")!.latex)).toBe(3);
  });

  it("reads N, RC and RxC", () => {
    const m3 = parseSizedTrigger("mat3")!;
    expect([rows(m3.latex), cols(m3.latex), m3.length]).toEqual([3, 3, 4]);
    const m34 = parseSizedTrigger("mat34")!;
    expect([rows(m34.latex), cols(m34.latex)]).toEqual([3, 4]);
    const p25 = parseSizedTrigger("pat2x5")!;
    expect([rows(p25.latex), cols(p25.latex)]).toContain(5);
    expect(p25.latex).toContain("pmatrix");
    expect(rows(parseSizedTrigger("mat10x2")!.latex)).toBe(10);
  });

  it("sys counts equations, amat counts unknowns, dat stays square", () => {
    expect(rows(parseSizedTrigger("sys4")!.latex)).toBe(4);
    const a3 = parseSizedTrigger("amat3")!.latex;
    expect([rows(a3), cols(a3)]).toEqual([3, 4]);
    expect(a3).toContain("{ccc|c}");
    const a35 = parseSizedTrigger("amat35")!.latex;
    expect([rows(a35), cols(a35)]).toEqual([3, 5]);
    expect(rows(parseSizedTrigger("dat4")!.latex)).toBe(4);
    expect(cols(parseSizedTrigger("dat33")!.latex)).toBe(3);
    expect(parseSizedTrigger("dat34")).toBeNull();
  });

  it("only matches at the end, and refuses silly sizes", () => {
    expect(parseSizedTrigger("2x+mat3")!.length).toBe(4);
    expect(parseSizedTrigger("amat2")!.length).toBe(5); // not "mat2"
    expect(parseSizedTrigger("mat0")).toBeNull();
    expect(parseSizedTrigger("mat11x2")).toBeNull();
    expect(parseSizedTrigger("sys23")).toBeNull();
    expect(parseSizedTrigger("x+1")).toBeNull();
  });

  it("structures are not left to MathLive's instant shortcuts", () => {
    const map = inlineShortcutMap();
    for (const t of ["sys", "mat", "pat", "dat", "amat"]) expect(map[t]).toBeUndefined();
    expect(map.forall).toBeDefined();
  });
});
