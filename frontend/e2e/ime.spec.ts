import { expect, test, type Page } from "@playwright/test";
import { freshPage, readLines } from "./helpers";

const first = async (page: Page) => (await readLines(page))[0].content;

/** Simulate a marked-text input method (e.g. Vietnamese Telex on macOS). */
async function compose(page: Page, updates: string[]) {
  await page.evaluate((seq) => {
    const mf = document.querySelector("math-field")!;
    const sink = mf.shadowRoot!.querySelector("[part=keyboard-sink]") as HTMLElement;
    const fire = (type: string, data: string) =>
      sink.dispatchEvent(new CompositionEvent(type, { data, bubbles: true, composed: true }));
    fire("compositionstart", "");
    for (const d of seq) fire("compositionupdate", d);
    fire("compositionend", seq[seq.length - 1]);
  }, updates);
}

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

for (const key of ["Tab", "Space"]) {
  test(`shortcut then ${key} keeps the caret in the first cell`, async ({ page }) => {
    await page.keyboard.type("mat");
    await page.keyboard.press(key);
    await page.keyboard.type("1");
    await page.keyboard.press("Tab");
    await page.keyboard.type("2");
    expect(await first(page)).toBe(
      "\\begin{bmatrix}1 & 2\\\\ \\placeholder{} & \\placeholder{}\\end{bmatrix}",
    );
  });
}

test("Tab expands a pending shortcut; longer triggers win", async ({ page }) => {
  await page.keyboard.type("Ainter B");
  expect(await first(page)).toBe("A\\cap B");
  await page.keyboard.press("Enter");
  await page.keyboard.type("x->inf");
  await page.keyboard.press("Tab");
  expect((await readLines(page))[1].content).toBe("x\\to\\infty");
});

test("IME composition: fractions and shortcuts work, no stray characters", async ({ page }) => {
  await compose(page, ["1", "1/", "1/2"]);
  expect(await first(page)).toBe("\\frac12");
  await page.keyboard.press("ArrowRight");
  await compose(page, ["+", "+m", "+ma", "+mat"]);
  await page.keyboard.type("5");
  expect(await first(page)).toBe(
    "\\frac12+\\begin{bmatrix}5 & \\placeholder{}\\\\ \\placeholder{} & \\placeholder{}\\end{bmatrix}",
  );
});

test("IME composition is previewed outside the formula", async ({ page }) => {
  await page.evaluate(() => {
    const mf = document.querySelector("math-field")!;
    const sink = mf.shadowRoot!.querySelector("[part=keyboard-sink]") as HTMLElement;
    sink.dispatchEvent(new CompositionEvent("compositionstart", { data: "", bubbles: true, composed: true }));
    sink.dispatchEvent(
      new CompositionEvent("compositionupdate", { data: "x^", bubbles: true, composed: true }),
    );
  });
  await expect(page.locator(".ime-preview")).toHaveText("x^");
  expect(await first(page)).toBe("");
});
