import { describe, expect, it } from "vitest";
import { resolveTheme } from "../src/core/theme";

describe("theme", () => {
  it("defaults to the e-ink look, light or dark like the device", () => {
    expect(resolveTheme("system", false)).toBe("eink");
    expect(resolveTheme("system", true)).toBe("eink-dark");
  });
  it("keeps an explicit choice", () => {
    for (const t of ["light", "dark", "eink", "eink-dark"] as const) {
      expect(resolveTheme(t, true)).toBe(t);
      expect(resolveTheme(t, false)).toBe(t);
    }
  });
});
