import { expect, test } from "@playwright/test";

test("loads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.getByText("MintMath", { exact: true })).toBeVisible();
  await expect(page.locator("math-field")).toHaveCount(1);
  await page.screenshot({ path: "test-results/smoke.png" });
  expect(errors).toEqual([]);
});
