import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { typeSample } from "./sampleSteps";

// The Android app's UI, simulated in the browser with the dev-only ?native flag.
test("app mode: PDF is built on the device; print/preview are hidden", async ({ page }) => {
  await page.goto("/?native=1");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator("math-field").first().click();
  await expect(page.getByRole("button", { name: "In", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Xem trước" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kết nối Backblaze B2" })).toBeVisible();

  await page.route(/\/api\/export\//, (r) => r.abort("internetdisconnected"));
  await typeSample(page);
  // Make the document span two pages.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`\\frac{${i}}{2}`);
  }
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "PDF", exact: true }).click(),
  ]);
  const pdf = readFileSync((await dl.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  const pages = (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  expect(pages).toBe(2);
});
