import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTex, escapeText, normalizeLatex, TexLineError } from "../src/core/texBuilder";
import type { Doc } from "../src/core/types";

// Shared with backend/tests/test_golden.py: both implementations must agree.
const BACKEND_TESTS = join(__dirname, "../../backend/tests");
const fixtures = readdirSync(join(BACKEND_TESTS, "fixtures"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));
const cases = JSON.parse(readFileSync(join(BACKEND_TESTS, "golden/normalize_cases.json"), "utf-8")) as {
  in: string;
  out?: string;
  error?: boolean;
}[];

describe("offline .tex export matches the backend", () => {
  it.each(fixtures)("fixture %s", (name) => {
    const doc = JSON.parse(readFileSync(join(BACKEND_TESTS, "fixtures", `${name}.json`), "utf-8")) as Doc;
    const golden = readFileSync(join(BACKEND_TESTS, "golden", `${name}.tex`), "utf-8");
    expect(buildTex(doc)).toBe(golden);
  });

  it.each(cases.map((c) => [c.in, c] as const))("normalize %s", (_label, c) => {
    if (c.error) expect(() => normalizeLatex(c.in)).toThrow(TexLineError);
    else expect(normalizeLatex(c.in)).toBe(c.out);
  });
});

describe("texBuilder", () => {
  it("escapes special text characters", () => {
    expect(escapeText("50% & $x_1$")).toBe("50\\% \\& \\$x\\_1\\$");
  });

  it("attaches the line id to errors", () => {
    const doc: Doc = {
      version: 1,
      id: "d",
      title: "",
      updatedAt: "",
      lines: [{ id: "bad", type: "math", content: "\\input{x}" }],
    };
    expect(() => buildTex(doc)).toThrow(expect.objectContaining({ lineId: "bad" }));
  });
});
