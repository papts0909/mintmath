import { expect, test } from "@playwright/test";
import { menu, menuItem, readLines } from "./helpers";

test("touch layout: action bar, on-screen math keyboard with MintMath keys", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const bar = page.getByRole("toolbar", { name: "Công cụ soạn" });
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
  // Less common commands are in "⋯".
  await bar.getByRole("button", { name: "Thêm lệnh" }).tap();
  await menuItem(page, "Đưa dòng lên").tap();
  expect((await readLines(page)).map((l) => l.type)).toEqual(["text", "math"]);
  await bar.getByRole("button", { name: "Thêm lệnh" }).tap();
  await menuItem(page, "Hoàn tác").tap();
  expect((await readLines(page)).map((l) => l.type)).toEqual(["math", "text"]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/mobile.png" });
});

test("touch layout: one Menu button; menus fit on the screen and work", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("menubar")).toHaveCount(0);
  await page.getByRole("button", { name: "Menu", exact: true }).tap();
  const top = page.getByRole("menu", { name: "Menu" });
  await expect(top).toBeVisible();
  const vw = page.viewportSize()!.width;
  const box = (await top.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  // Submenus open below their item.
  await menuItem(page, "Xem").tap();
  await menuItem(page, "Giao diện").tap();
  await menuItem(page, "Giấy tối").tap();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "eink-dark");
  // The "⋯" menu stays on screen too.
  await page.getByRole("button", { name: "Thêm lệnh" }).tap();
  const more = (await page.getByRole("menu", { name: "Thêm lệnh" }).boundingBox())!;
  expect(more.x).toBeGreaterThanOrEqual(0);
  expect(more.x + more.width).toBeLessThanOrEqual(vw + 1);
  await page.keyboard.press("Escape");
  await menu(page, "Chèn", "Phân số");
  await expect.poll(async () => (await readLines(page))[0].content).toContain("\\frac");
});
