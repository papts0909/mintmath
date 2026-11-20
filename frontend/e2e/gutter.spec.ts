import { expect, test, type Page } from "@playwright/test";
import { freshPage, readLines } from "./helpers";

/** Right edge of each line number, in page pixels. */
const numberEdges = (page: Page) =>
  page
    .locator(".gutter .num")
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));

for (const theme of ["eink", "light"] as const) {
  for (const width of [1100, 390]) {
    test(`line numbers line up (${theme}, ${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await freshPage(page);
      await page.evaluate(
        (t) => localStorage.setItem("mathpad.settings.v1", JSON.stringify({ theme: t })),
        theme,
      );
      await page.reload();
      await page.locator("math-field").first().click();
      await page.keyboard.type("x+1");
      await page.keyboard.press("Shift+Enter"); // joined math line (↳)
      await page.keyboard.type("=2");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Control+'"); // text line ("T")
      await page.keyboard.type("Ghi chú");
      await expect.poll(async () => (await readLines(page)).length).toBe(3);
      // Back to the first line so a math line has the focus frame.
      await page.locator("math-field").first().click();
      const edges = await numberEdges(page);
      expect(edges).toHaveLength(3);
      expect(new Set(edges).size, `edges ${edges.join(", ")}`).toBe(1);
    });
  }
}
