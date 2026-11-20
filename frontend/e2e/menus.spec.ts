import { expect, test } from "@playwright/test";
import { freshPage, menu, menuItem, readLines } from "./helpers";

const first = async (page: import("@playwright/test").Page) => (await readLines(page))[0].content;

test.beforeEach(async ({ page }) => freshPage(page));

test("menu bar works with the keyboard: F10, arrows, Enter, Esc", async ({ page }) => {
  await page.keyboard.press("F10");
  const tep = page.getByRole("menuitem", { name: "Tệp", exact: true });
  await expect(tep).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu", { name: "Tệp" })).toBeVisible();
  await expect(menuItem(page, "Bài mới (tab mới)")).toBeFocused();
  // → on an item without a submenu moves to the next menu.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menu", { name: "Chỉnh sửa" })).toBeVisible();
  await expect(page.getByRole("menu", { name: "Tệp" })).toHaveCount(0);
  // Focus lands on the first enabled item (Hoàn tác / Làm lại are disabled).
  await expect(menuItem(page, "Nhân đôi dòng")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Chỉnh sửa", exact: true })).toBeFocused();
});

test("Chèn ▸ Ma trận: pick 3 × 4 on the grid; it goes in at the caret", async ({ page }) => {
  await page.keyboard.type("A=");
  await page.getByRole("menuitem", { name: "Chèn", exact: true }).click();
  await menuItem(page, "Ma trận").hover();
  await page.getByRole("radio", { name: "Ma trận ( )" }).click();
  await page.getByRole("gridcell", { name: "3 × 4" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect.poll(() => first(page)).toMatch(/^A=\\begin\{pmatrix\}/);
  const body = (await first(page)).replace(/^.*?\\begin\{pmatrix\}|\\end\{pmatrix\}$/g, "");
  expect(body.split("\\\\")).toHaveLength(3);
  expect(body.split("\\\\")[0].split("&")).toHaveLength(4);
  // The first cell is ready for typing.
  await page.keyboard.type("7");
  await expect.poll(() => first(page)).toMatch(/pmatrix\}7/);
});

test("Chèn ▸ Hệ phương trình ▸ 3; Dòng ▸ Đổi Toán ⇄ Chữ; toolbar keeps the caret", async ({ page }) => {
  await menu(page, "Chèn", "Hệ phương trình", "3 phương trình");
  await expect.poll(() => first(page)).toContain("\\begin{cases}");
  expect((await first(page)).split("\\\\")).toHaveLength(3);

  const bar = page.getByRole("toolbar", { name: "Công cụ soạn" });
  await bar.getByRole("button", { name: "Thêm dòng chữ" }).click();
  await expect(page.locator("textarea.text-line")).toBeFocused();
  await page.keyboard.type("Ghi chú");
  await menu(page, "Dòng", "Đổi Toán ⇄ Chữ");
  await expect.poll(async () => (await readLines(page)).map((l) => l.type)).toEqual(["math", "math"]);
});

test("Ctrl+P prints the document layout; Xem ▸ Chế độ Zen", async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => void (window as unknown as { printed: number }).printed++;
  });
  await page.keyboard.type("x^2");
  await page.keyboard.press("Control+p");
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  await menu(page, "Xem", "Chế độ Zen");
  await expect(page.locator(".toolbar")).toBeHidden();
});

test("a narrow window moves toolbar buttons into ⋯", async ({ page }) => {
  const bar = page.getByRole("toolbar", { name: "Công cụ soạn" });
  await expect(bar.getByRole("button", { name: "Căn bậc hai" })).toBeVisible();
  await page.setViewportSize({ width: 560, height: 700 });
  await expect(bar.getByRole("button", { name: "Căn bậc hai" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Thêm lệnh" }).click();
  await menuItem(page, "Căn bậc hai").click();
  await expect.poll(() => first(page)).toContain("\\sqrt");
  // Main commands stay.
  await expect(bar.getByRole("button", { name: "Thêm dòng toán", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Xuất" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
