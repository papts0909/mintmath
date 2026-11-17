import { beforeEach, describe, expect, it } from "vitest";
import { HISTORY_LIMIT, resetDocStore, useDocStore } from "../src/core/docStore";
import type { Doc } from "../src/core/types";

const s = () => useDocStore.getState();
const ids = () => s().doc.lines.map((l) => l.id);
const contents = () => s().doc.lines.map((l) => l.content);

function seed(n: number): string[] {
  const first = s().doc.lines[0].id;
  s().updateLine(first, "0");
  let prev = first;
  for (let i = 1; i < n; i++) {
    prev = s().insertLineAfter(prev, i % 2 ? "text" : "math", { content: String(i) });
  }
  return ids();
}

beforeEach(() => resetDocStore());

describe("docStore", () => {
  it("starts with one empty math line", () => {
    expect(s().doc.lines).toHaveLength(1);
    expect(s().doc.lines[0]).toMatchObject({ type: "math", content: "" });
    expect(s().doc.version).toBe(1);
  });

  it("insertLineAfter inserts at the right place and focuses it", () => {
    const [a] = ids();
    const b = s().insertLineAfter(a, "text");
    const c = s().insertLineAfter(a, "math", { joinPrev: true });
    expect(ids()).toEqual([a, c, b]);
    expect(s().focusedLineId).toBe(c);
    expect(s().doc.lines[1].joinPrev).toBe(true);
    expect(s().doc.lines[2].type).toBe("text");
  });

  it("insertLineAfter(null) inserts at the top", () => {
    const [a] = ids();
    const b = s().insertLineAfter(null, "text");
    expect(ids()).toEqual([b, a]);
  });

  it("updateLine changes content and marks dirty", () => {
    const [a] = ids();
    s().updateLine(a, "x^2");
    expect(contents()).toEqual(["x^2"]);
    expect(s().dirty).toBe(true);
    expect(s().lastChangeStructural).toBe(false);
  });

  it("updateLine clears an error on that line", () => {
    const [a] = ids();
    s().setError({ lineId: a, message: "bad" });
    s().updateLine(a, "y");
    expect(s().error).toBeNull();
  });

  it("deleteLine removes and focuses the line above", () => {
    const [a, b, c] = seed(3);
    s().deleteLine(c);
    expect(ids()).toEqual([a, b]);
    expect(s().focusedLineId).toBe(b);
  });

  it("deleting the last line keeps at least one line", () => {
    const [a] = ids();
    s().deleteLine(a);
    expect(s().doc.lines).toHaveLength(1);
    expect(s().doc.lines[0].id).not.toBe(a);
    expect(s().focusedLineId).toBe(s().doc.lines[0].id);
  });

  it("deleting the first line clears joinPrev on the new first line", () => {
    const [a] = ids();
    const b = s().insertLineAfter(a, "math", { joinPrev: true });
    s().deleteLine(a);
    expect(ids()).toEqual([b]);
    expect(s().doc.lines[0].joinPrev).toBeUndefined();
  });

  it("deleteLines removes several lines", () => {
    const [a, b, c, d] = seed(4);
    s().deleteLines([b, c]);
    expect(ids()).toEqual([a, d]);
    s().deleteLines([a, d]);
    expect(s().doc.lines).toHaveLength(1);
  });

  it("toggleType switches math/text and keeps content", () => {
    const [a] = ids();
    s().updateLine(a, "abc");
    s().toggleType(a);
    expect(s().doc.lines[0]).toMatchObject({ type: "text", content: "abc" });
    s().toggleType(a);
    expect(s().doc.lines[0].type).toBe("math");
  });

  it("moveLine reorders and clamps", () => {
    const [a, b, c] = seed(3);
    s().moveLine(a, 2);
    expect(ids()).toEqual([b, c, a]);
    s().moveLine(a, -5);
    expect(ids()).toEqual([a, b, c]);
    s().moveLine(c, 99);
    expect(ids()).toEqual([a, b, c]);
  });

  it("moveLine drops joinPrev from a line moved to the top", () => {
    const [a] = ids();
    const b = s().insertLineAfter(a, "math", { joinPrev: true });
    s().moveLine(b, 0);
    expect(s().doc.lines[0].joinPrev).toBeUndefined();
  });

  it("setJoinPrev toggles but never on the first line", () => {
    const [a, b] = seed(2);
    s().setJoinPrev(a, true);
    expect(s().doc.lines[0].joinPrev).toBeUndefined();
    s().setJoinPrev(b, true);
    expect(s().doc.lines[1].joinPrev).toBe(true);
    s().setJoinPrev(b, false);
    expect(s().doc.lines[1].joinPrev).toBeUndefined();
  });

  it("duplicateLine copies after the original with a new id", () => {
    const [a] = ids();
    s().updateLine(a, "z");
    const copy = s().duplicateLine(a);
    expect(copy).not.toBe(a);
    expect(contents()).toEqual(["z", "z"]);
    expect(ids()[1]).toBe(copy);
  });

  it("insertLinesAfter inserts many lines", () => {
    const [a] = ids();
    const made = s().insertLinesAfter(a, [
      { type: "text", content: "t" },
      { type: "math", content: "m" },
    ]);
    expect(made).toHaveLength(2);
    expect(contents()).toEqual(["", "t", "m"]);
    expect(s().focusedLineId).toBe(made[1]);
  });

  it("setTitle, loadDoc and newDoc", () => {
    s().setTitle("Bài 1");
    expect(s().doc.title).toBe("Bài 1");
    const doc: Doc = {
      version: 1,
      id: "d1",
      title: "T",
      updatedAt: "2026-01-01T00:00:00Z",
      lines: [{ id: "x", type: "text", content: "hi" }],
    };
    s().loadDoc(doc);
    expect(s().doc.id).toBe("d1");
    expect(s().dirty).toBe(false);
    expect(s().past).toHaveLength(0);
    s().newDoc();
    expect(s().doc.title).toBe("");
    expect(s().doc.lines).toHaveLength(1);
  });

  it("loadDoc of an empty doc yields one line", () => {
    s().loadDoc({ version: 1, id: "e", title: "", updatedAt: "", lines: [] });
    expect(s().doc.lines).toHaveLength(1);
  });

  it("focusRelative moves within bounds", () => {
    const [a, b] = seed(2);
    expect(s().focusRelative(a, 1)).toBe(true);
    expect(s().focusedLineId).toBe(b);
    expect(s().focusEdge).toBe("start");
    expect(s().focusRelative(b, 1)).toBe(false);
    expect(s().focusRelative(b, -1)).toBe(true);
    expect(s().focusEdge).toBe("end");
  });
});

describe("undo/redo", () => {
  it("undoes and redoes structural changes", () => {
    const [a] = ids();
    const b = s().insertLineAfter(a, "text");
    expect(s().undo()).toBe(true);
    expect(ids()).toEqual([a]);
    expect(s().redo()).toBe(true);
    expect(ids()).toEqual([a, b]);
  });

  it("keeps text typed after the structural change", () => {
    const [a] = ids();
    const b = s().insertLineAfter(a, "text");
    s().toggleType(b);
    s().updateLine(b, "typed");
    s().undo(); // undo toggleType
    expect(s().doc.lines[1]).toMatchObject({ id: b, type: "text", content: "typed" });
  });

  it("restores a deleted line with its content", () => {
    const [a, b] = seed(2);
    s().deleteLine(b);
    s().undo();
    expect(ids()).toEqual([a, b]);
    expect(contents()).toEqual(["0", "1"]);
  });

  it("does nothing with empty history", () => {
    expect(s().undo()).toBe(false);
    expect(s().redo()).toBe(false);
  });

  it("a new change clears redo", () => {
    const [a] = ids();
    s().insertLineAfter(a, "text");
    s().undo();
    s().insertLineAfter(a, "math");
    expect(s().redo()).toBe(false);
  });

  it(`keeps at most ${HISTORY_LIMIT} steps`, () => {
    const [a] = ids();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) s().toggleType(a);
    expect(s().past).toHaveLength(HISTORY_LIMIT);
  });
});
