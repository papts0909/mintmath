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
  await pickTheme(page, "Giấy (e-ink)");
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
  await pickTheme(page, "Giấy tối (e-ink)");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "eink-dark");
  expect(await css(page, "body", "background-color")).toBe("rgb(0, 0, 0)");
  expect(await css(page, "body", "color")).toBe("rgb(255, 255, 255)");
});

test("'Theo hệ thống' picks the e-ink theme on a monochrome screen", async ({ page }) => {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) =>
      q.includes("monochrome")
        ? ({
            matches: true,
            media: q,
            addEventListener() {},
            removeEventListener() {},
          } as unknown as MediaQueryList)
        : real(q);
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "eink");
});
