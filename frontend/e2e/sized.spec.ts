import { expect, test, type Page } from "@playwright/test";
import { freshPage, readLines } from "./helpers";

const first = async (page: Page) => (await readLines(page))[0].content;
const shape = (latex: string) => {
  const body = latex.replace(/^.*?\\begin\{[a-z]+\}(\{[^}]*\})?/, "").replace(/\\end\{.*$/, "");
  const r = body.split("\\\\");
  return [r.length, r[0].split("&").length];
};

test.beforeEach(async ({ page }) => freshPage(page));

test("mat34 then Space makes a 3×4 matrix with the first cell ready", async ({ page }) => {
  await page.keyboard.type("mat34");
  await page.keyboard.press("Space");
  await page.keyboard.type("7");
  const c = await first(page);
  expect(c).toContain("bmatrix");
  expect(shape(c)).toEqual([3, 4]);
  expect(c).toMatch(/\\begin\{bmatrix\}7/);
});

test("sizes for systems, determinants and augmented matrices", async ({ page }) => {
  await page.keyboard.type("sys4");
  await page.keyboard.press("Tab");
  expect(shape(await first(page))).toEqual([4, 1]);

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  // (Enter on the last row of a system adds a line below the structure.)
  const lines = await readLines(page);
  await page
    .locator("math-field")
    .nth(lines.length - 1)
    .click();
  await page.keyboard.type("amat3");
  await page.keyboard.press("Space");
  const a = (await readLines(page)).at(-1)!.content;
  expect(a).toContain("{ccc|c}");
  expect(shape(a)).toEqual([3, 4]);
});

test("typing on right after a trigger still works as before (2×2, no Space needed)", async ({ page }) => {
  await page.keyboard.type("sysx+y=1;x-y=0");
  expect(await first(page)).toBe("\\begin{cases}x+y=1\\\\ x-y=0\\end{cases}");
});

test("digits after a trigger are a size, not a subscript; d1 still becomes d₁", async ({ page }) => {
  await page.keyboard.type("d1+");
  expect(await first(page)).toBe("d_1+");
  await page.keyboard.type("pat2x3");
  await page.keyboard.press("Space");
  const c = await first(page);
  expect(c).toContain("pmatrix");
  expect(shape(c.replace(/^d_1\+/, ""))).toEqual([2, 3]);
});
