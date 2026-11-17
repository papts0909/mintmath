import { expect, test, type Page } from "@playwright/test";
import { freshPage, readLines } from "./helpers";

const first = async (page: Page) => (await readLines(page))[0].content;

/** Simulate a marked-text input method (e.g. Vietnamese Telex on macOS) the
 *  way WebKit delivers it: composition/input events that do NOT leave the
 *  shadow tree, keydowns with keyCode 229 while composing, and the commit
 *  input event after compositionend. */
async function compose(page: Page, updates: string[], opts: { composed?: boolean } = {}) {
  await page.evaluate(
    ({ seq, composed }) => {
      const mf = document.querySelector("math-field")!;
      const sink = mf.shadowRoot!.querySelector("[part=keyboard-sink]") as HTMLElement;
      const comp = (type: string, data: string) =>
        sink.dispatchEvent(new CompositionEvent(type, { data, bubbles: true, composed }));
      const key = (k: string) => {
        const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, composed: true, cancelable: true });
        Object.defineProperty(ev, "keyCode", { value: 229 });
        Object.defineProperty(ev, "isComposing", { value: true });
        sink.dispatchEvent(ev);
      };
      const input = (type: string, inputType: string, data: string, isComposing: boolean) =>
        sink.dispatchEvent(
          new InputEvent(type, { data, inputType, isComposing, bubbles: true, composed: true }),
        );
      comp("compositionstart", "");
      let prev = "";
      for (const d of seq) {
        key(d.slice(prev.length) || d);
        input("beforeinput", "insertCompositionText", d, true);
        comp("compositionupdate", d);
        sink.textContent = d; // what the IME writes into the contenteditable
        input("input", "insertCompositionText", d, true);
        prev = d;
      }
      const last = seq[seq.length - 1];
      comp("compositionend", last);
      input("input", "insertFromComposition", last, false);
    },
    { seq: updates, composed: opts.composed ?? false },
  );
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

for (const composed of [false, true]) {
  test(`IME composition (${composed ? "Chromium" : "WebKit"}-style events): fractions, shortcuts, no stray characters`, async ({
    page,
  }) => {
    await compose(page, ["1", "1/", "1/2"], { composed });
    expect(await first(page)).toBe("\\frac12");
    await page.keyboard.press("ArrowRight");
    await compose(page, ["+", "+m", "+ma", "+mat"], { composed });
    await page.keyboard.type("5");
    expect(await first(page)).toBe(
      "\\frac12+\\begin{bmatrix}5 & \\placeholder{}\\\\ \\placeholder{} & \\placeholder{}\\end{bmatrix}",
    );
    // Typing continues normally after a composition.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.type("=x");
    expect(await first(page)).toMatch(/=x$/);
  });
}

test("with the IME fix switched off, MathLive handles composition itself", async ({ page }) => {
  await page.getByText("⚙ Cài đặt").click();
  await page.getByLabel(/Sửa bộ gõ TV/).uncheck();
  await page.locator("math-field").first().click();
  await compose(page, ["x"], { composed: true });
  await page.keyboard.type("+1");
  expect(await first(page)).toContain("+1");
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
