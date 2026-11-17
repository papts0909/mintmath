import { expect, test } from "@playwright/test";
import { readLines } from "./helpers";

test("touch layout: action bar, on-screen math keyboard with MintMath keys", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const bar = page.getByRole("toolbar", { name: "Thao tác dòng" });
  await expect(bar).toBeVisible();

  // Tapping the math line opens MathLive's keyboard on a touch device.
  await page.locator("math-field").first().tap();
  const kbd = page.locator(".ML__keyboard");
  await expect(kbd).toBeVisible();
  await expect(kbd.getByText("MintMath", { exact: true }).first()).toBeVisible();

  // Insert an augmented matrix from the MintMath layout.
  await kbd.locator(".MLK__keycap", { hasText: "[A|b]" }).first().tap();
  await expect.poll(async () => (await readLines(page))[0].content).toContain("\\begin{array}{cc|c}");

  // Line actions without a hardware keyboard.
  await bar.getByRole("button", { name: "Thêm dòng chữ" }).tap();
  await expect(page.locator("textarea.text-line")).toBeFocused();
  await page.keyboard.type("Ghi chú");
  await bar.getByRole("button", { name: "Đưa dòng lên" }).tap();
  expect((await readLines(page)).map((l) => l.type)).toEqual(["text", "math"]);
  await bar.getByRole("button", { name: "Hoàn tác" }).tap();
  expect((await readLines(page)).map((l) => l.type)).toEqual(["math", "text"]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/mobile.png" });
});
