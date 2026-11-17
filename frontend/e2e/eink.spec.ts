import { expect, test, type Page } from "@playwright/test";
import { freshPage } from "./helpers";

const css = (page: Page, sel: string, prop: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

async function pickTheme(page: Page, label: string) {
  await page.getByText("Cài đặt").click();
  await page.getByLabel("Giao diện").selectOption({ label });
  await page.keyboard.press("Escape");
}

test.beforeEach(async ({ page }) => freshPage(page));

test("e-ink theme: black on white, thick focus frame, no shadows or transitions", async ({ page }) => {
  await pickTheme(page, "Giấy sáng");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "eink");
  expect(await css(page, "body", "background-color")).toBe("rgb(255, 255, 255)");
  expect(await css(page, "body", "color")).toBe("rgb(0, 0, 0)");

  const cta = page.getByRole("button", { name: "Kết nối Backblaze B2" });
  expect(await cta.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(0, 0, 0)");
  // Hovering does not wash out the black button.
  await cta.hover();
  expect(await cta.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(0, 0, 0)");

  await page.locator("math-field").first().click();
  const line = page.locator(".line.is-focused");
  await expect(line).toHaveCount(1);
  expect(await line.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("2px");
  expect(await line.evaluate((el) => getComputedStyle(el).boxShadow)).toContain("inset");
  expect(await css(page, "button", "transition-duration")).toBe("0s");
  expect(await css(page, ".settings-panel", "box-shadow")).toBe("none");

  // Kept after a reload.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "eink");
});

test("e-ink dark theme is the same, inverted", async ({ page }) => {
  await pickTheme(page, "Giấy tối");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "eink-dark");
  expect(await css(page, "body", "background-color")).toBe("rgb(0, 0, 0)");
  expect(await css(page, "body", "color")).toBe("rgb(255, 255, 255)");
});

test("by default the e-ink theme follows the device's light/dark setting", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "eink");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "eink-dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "eink");
  // The colour themes are still there.
  await pickTheme(page, "Màu – tối");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("Zen mode shows only the document; Ctrl+. or the button brings the rest back", async ({ page }) => {
  await page.keyboard.type("x^2");
  await page.getByRole("button", { name: "Zen", exact: true }).click();
  for (const name of ["Thư viện", "Kết nối Backblaze B2", "Cài đặt"])
    await expect(page.getByRole("button", { name, exact: true })).toBeHidden();
  await expect(page.locator(".toolbar")).toBeHidden();
  await expect(page.locator(".tab-bar")).toBeHidden();
  await expect(page.locator(".status-bar")).toBeHidden();
  await expect(page.locator("math-field").first()).toBeVisible();

  // Still editable, and kept after a reload.
  await page.locator("math-field").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type("+1");
  await page.reload();
  await expect(page.locator(".toolbar")).toBeHidden();

  await page.getByRole("button", { name: "Thoát Zen" }).click();
  await expect(page.locator(".toolbar")).toBeVisible();
  await page.keyboard.press("Control+.");
  await expect(page.locator(".toolbar")).toBeHidden();
  await page.keyboard.press("Control+.");
  await expect(page.locator(".toolbar")).toBeVisible();
});
