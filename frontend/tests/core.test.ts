import { describe, expect, it, vi } from "vitest";
import {
  DocFormatError,
  docFileName,
  isDocEmpty,
  newDocument,
  parseDoc,
  parseDocText,
  serializeDoc,
} from "../src/core/docFormat";
import {
  addColumn,
  buildEnv,
  countPlaceholders,
  insertSpecColumn,
  locateCell,
  splitCells,
  specColumns,
} from "../src/core/matrix";
import { isMultiLine, linesToClipboard, splitPastedText } from "../src/core/paste";
import {
  createAutosaver,
  DEFAULT_SETTINGS,
  loadLocal,
  loadSettings,
  saveLocal,
  saveSettings,
  STORAGE_KEY,
} from "../src/core/persistence";
import { inlineShortcutMap, searchShortcuts, SHORTCUTS, SHORTCUT_GROUPS } from "../src/core/shortcuts";

describe("docFormat", () => {
  it("round-trips a document", () => {
    const d = newDocument();
    d.title = "Bài";
    d.lines.push({ id: "j", type: "math", content: "x", joinPrev: true });
    expect(parseDocText(serializeDoc(d))).toEqual(d);
  });

  it("rejects newer versions with a clear message", () => {
    expect(() => parseDoc({ version: 2, lines: [] })).toThrow(/phiên bản MintMath mới hơn/);
  });

  it.each([
    [null],
    [[]],
    [{ lines: [] }],
    [{ version: 1 }],
    [{ version: 1, lines: [{ type: "x", content: "" }] }],
    [{ version: 1, lines: [{ type: "math" }] }],
    [{ version: 0, lines: [] }],
  ])("rejects invalid structure %#", (v) => {
    expect(() => parseDoc(v)).toThrow(DocFormatError);
  });

  it("rejects non-JSON", () => {
    expect(() => parseDocText("{nope")).toThrow(DocFormatError);
  });

  it("fills missing ids and dedupes", () => {
    const d = parseDoc({
      version: 1,
      lines: [
        { type: "text", content: "a" },
        { id: "x", type: "math", content: "b" },
        { id: "x", type: "math", content: "c" },
      ],
    });
    const ids = d.lines.map((l) => l.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[1]).toBe("x");
    expect(d.title).toBe("");
  });

  it("names files", () => {
    expect(docFileName(" Bài 1: hệ/phương trình ")).toBe("Bài_1_hệphương_trình.mintmath.json");
    expect(docFileName("")).toBe("mintmath.mintmath.json");
  });

  it("detects empty docs", () => {
    const d = newDocument();
    expect(isDocEmpty(d)).toBe(true);
    d.lines[0].content = "x";
    expect(isDocEmpty(d)).toBe(false);
  });
});

describe("persistence", () => {
  it("saves and loads", () => {
    const d = newDocument();
    d.title = "t";
    expect(saveLocal({ doc: d })).toBe(true);
    expect(loadLocal()).toEqual({ doc: d });
  });

  it("returns null on corrupt or missing data", () => {
    localStorage.removeItem(STORAGE_KEY);
    expect(loadLocal()).toBeNull();
    localStorage.setItem(STORAGE_KEY, "{bad");
    expect(loadLocal()).toBeNull();
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    } as unknown as Storage;
    expect(saveLocal({ doc: newDocument() }, broken)).toBe(false);
    expect(loadLocal(broken)).toBeNull();
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, broken)).not.toThrow();
  });

  it("debounces writes", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const saver = createAutosaver(write, 500);
    saver.schedule();
    vi.advanceTimersByTime(300);
    saver.schedule();
    vi.advanceTimersByTime(300);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(write).toHaveBeenCalledTimes(1);
    saver.schedule();
    saver.flush();
    expect(write).toHaveBeenCalledTimes(2);
    saver.schedule();
    saver.cancel();
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("settings round-trip and validate", () => {
    saveSettings({ autoSubscript: false, imeFix: false, theme: "dark" });
    expect(loadSettings()).toEqual({ autoSubscript: false, imeFix: false, theme: "dark" });
    for (const theme of ["eink", "eink-dark"] as const) {
      saveSettings({ ...DEFAULT_SETTINGS, theme });
      expect(loadSettings().theme).toBe(theme);
    }
    localStorage.setItem("mathpad.settings.v1", JSON.stringify({ theme: "pink" }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("shortcuts", () => {
  it("has the required triggers", () => {
    const map = inlineShortcutMap();
    for (const t of ["forall", "Rbb", "=>", "<=>", "iff"]) {
      expect(map[t]).toBeTruthy();
    }
    // Structures are listed too, but expanded by MintMath itself (sizes).
    const triggers = SHORTCUTS.map((s) => s.trigger);
    for (const t of ["sys", "mat", "amat", "pat", "dat"]) expect(triggers).toContain(t);
    expect(map.Rbb).toBe("\\mathbb{R}");
  });

  it("uses only known groups and unique triggers", () => {
    const triggers = SHORTCUTS.map((s) => s.trigger);
    expect(new Set(triggers).size).toBe(triggers.length);
    for (const s of SHORTCUTS) expect(SHORTCUT_GROUPS).toContain(s.group);
  });

  it("searches by trigger or label", () => {
    expect(searchShortcuts("rbb").map((s) => s.trigger)).toEqual(["Rbb"]);
    expect(searchShortcuts("tương đương").length).toBe(2);
    expect(searchShortcuts("")).toHaveLength(SHORTCUTS.length);
  });
});

describe("matrix", () => {
  it("builds environments with placeholders", () => {
    expect(buildEnv("cases", 2, 1)).toBe("\\begin{cases}\\placeholder{}\\\\\\placeholder{}\\end{cases}");
    expect(buildEnv("bmatrix", 2, 2)).toBe(
      "\\begin{bmatrix}\\placeholder{}&\\placeholder{}\\\\\\placeholder{}&\\placeholder{}\\end{bmatrix}",
    );
    const aug = buildEnv("augmented", 2, 3);
    expect(aug.startsWith("\\left[\\begin{array}{cc|c}")).toBe(true);
    expect(aug.endsWith("\\end{array}\\right]")).toBe(true);
    expect(countPlaceholders(aug, aug.length)).toBe(6);
  });

  it("locates the cell under a marker", () => {
    const tex = "x=\\begin{bmatrix}1&2\\\\3&@4\\end{bmatrix}";
    const loc = locateCell(tex, tex.indexOf("@"));
    expect(loc).toMatchObject({ env: "bmatrix", row: 1, col: 1, rows: 2, rowCols: [2, 2] });
  });

  it("returns null outside structures", () => {
    const tex = "a@+\\begin{bmatrix}1\\end{bmatrix}";
    expect(locateCell(tex, tex.indexOf("@"))).toBeNull();
  });

  it("ignores ampersands in nested groups and finds innermost env", () => {
    const tex = "\\begin{cases}x&\\frac{a}{b}\\\\\\begin{bmatrix}1&@\\end{bmatrix}\\end{cases}";
    const loc = locateCell(tex, tex.indexOf("@"));
    expect(loc).toMatchObject({ env: "bmatrix", row: 0, col: 1 });
    const outer = "\\begin{cases}x&\\frac{a}{b}\\\\@y\\end{cases}";
    expect(locateCell(outer, outer.indexOf("@"))).toMatchObject({
      env: "cases",
      row: 1,
      col: 0,
      rowCols: [2, 1],
    });
  });

  it("reads array specs", () => {
    const tex = "\\left[\\begin{array}{ccc|c}1&1&2&@3\\\\2&3&5&7\\end{array}\\right]";
    const loc = locateCell(tex, tex.indexOf("@"));
    expect(loc).toMatchObject({ env: "array", spec: "ccc|c", row: 0, col: 3, rows: 2 });
  });

  it("splits cells", () => {
    expect(splitCells("1&\\frac{a}{b}\\\\c&\\begin{matrix}x&y\\end{matrix}")).toEqual([
      ["1", "\\frac{a}{b}"],
      ["c", "\\begin{matrix}x&y\\end{matrix}"],
    ]);
  });

  it("handles array specs", () => {
    expect(specColumns("ccc|c")).toBe(4);
    expect(insertSpecColumn("cc|c", 0)).toBe("ccc|c");
    expect(insertSpecColumn("cc|c", 1)).toBe("ccc|c");
    expect(insertSpecColumn("cc|c", 2)).toBe("ccc|c");
    expect(insertSpecColumn("ccc", 2)).toBe("cccc");
  });

  it("adds a column to an augmented matrix", () => {
    const tex = "\\left[\\begin{array}{c|c}1&@2\\\\3&4\\end{array}\\right]";
    const clean = tex.replace("@", "");
    const loc = locateCell(tex, tex.indexOf("@"));
    expect(loc).not.toBeNull();
    // compute against the marker-free string: shift indices after the marker
    const locClean = locateCell(clean, tex.indexOf("@"));
    const { latex, placeholderIndex } = addColumn(clean, locClean!);
    expect(latex).toBe(
      "\\left[\\begin{array}{cc|c}1&2&\\placeholder{}\\\\3&4&\\placeholder{}\\end{array}\\right]",
    );
    expect(latex.slice(placeholderIndex).startsWith("\\placeholder{}")).toBe(true);
    expect(countPlaceholders(latex, placeholderIndex)).toBe(0);
  });

  it("adds a column to a bmatrix in the middle", () => {
    const tex = "\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}";
    const loc = locateCell(tex, tex.indexOf("3"))!;
    const { latex, placeholderIndex } = addColumn(tex, loc);
    expect(latex).toBe("\\begin{bmatrix}1&\\placeholder{}&2\\\\3&\\placeholder{}&4\\end{bmatrix}");
    expect(countPlaceholders(latex, placeholderIndex)).toBe(1);
  });
});

describe("paste", () => {
  it("splits text and math lines", () => {
    expect(splitPastedText("Giải:\n$x+1=0$\r\n\n\\[ y \\]\n$$z$$\nplain $a$ text")).toEqual([
      { type: "text", content: "Giải:" },
      { type: "math", content: "x+1=0" },
      { type: "math", content: "y" },
      { type: "math", content: "z" },
      { type: "text", content: "plain $a$ text" },
    ]);
  });

  it("detects multi-line text", () => {
    expect(isMultiLine("a\nb")).toBe(true);
    expect(isMultiLine("ab\n")).toBe(false);
  });

  it("copies lines in a pasteable form", () => {
    expect(linesToClipboard([{ id: "a", type: "math", content: "x^2" }])).toBe("x^2");
    const text = linesToClipboard([
      { id: "a", type: "text", content: "Ta có" },
      { id: "b", type: "math", content: "x^2" },
    ]);
    expect(text).toBe("Ta có\n$x^2$");
    expect(splitPastedText(text)).toEqual([
      { type: "text", content: "Ta có" },
      { type: "math", content: "x^2" },
    ]);
  });
});
