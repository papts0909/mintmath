import { expect, test, type Page } from "@playwright/test";
import { freshPage, menu, readLines } from "./helpers";

const tabs = (page: Page) => page.getByRole("tablist", { name: "Các bài đang mở" }).getByRole("tab");

async function typeInFirstLine(page: Page, text: string) {
  await page.locator("math-field").first().click();
  await page.keyboard.type(text);
  await expect.poll(async () => (await readLines(page))[0].content).toBe(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase("mathpad");
      req.onsuccess = req.onerror = req.onblocked = () => r(null);
    });
  });
  await freshPage(page);
});

test("several documents in tabs: new, switch, keep content and undo, close", async ({ page }) => {
  await page.locator(".title-input").fill("Bài A");
  await typeInFirstLine(page, "a+1");
  await page.keyboard.press("Enter"); // a new line: an undoable change
  await expect.poll(async () => (await readLines(page)).length).toBe(2);
  await expect(tabs(page)).toHaveText(["Bài A"]);

  await page.getByRole("button", { name: "Mở bài mới trong tab mới" }).click();
  await expect(tabs(page)).toHaveCount(2);
  await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
  await page.locator(".title-input").fill("Bài B");
  await typeInFirstLine(page, "b");
  await expect(tabs(page)).toHaveText(["Bài A", "Bài B"]);

  // Back to A: its content and its own undo history are there.
  await tabs(page).first().click();
  await expect(page.locator(".title-input")).toHaveValue("Bài A");
  expect((await readLines(page))[0].content).toBe("a+1");
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await expect.poll(async () => (await readLines(page)).length).toBe(1);

  // Keyboard: → moves to the next tab.
  await tabs(page).first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".title-input")).toHaveValue("Bài B");

  // Reload: the tabs and the active one come back.
  await page.waitForTimeout(700); // autosave
  await page.reload();
  await expect(tabs(page)).toHaveText(["Bài A", "Bài B"]);
  await expect(page.locator(".title-input")).toHaveValue("Bài B");

  // Close B: A is shown; B stays in the library.
  await page.getByRole("button", { name: "Đóng tab Bài B" }).click();
  await expect(tabs(page)).toHaveText(["Bài A"]);
  await expect(page.locator(".title-input")).toHaveValue("Bài A");
  await menu(page, "Tệp", "Thư viện");
  const lib = page.getByRole("complementary", { name: "Thư viện bài tập" });
  await expect(lib.getByText("Bài B")).toBeVisible();

  // Opening it from the library brings back its tab.
  await lib.getByRole("button", { name: /^Bài B/ }).click();
  await expect(tabs(page)).toHaveText(["Bài A", "Bài B"]);
  await expect(page.locator(".title-input")).toHaveValue("Bài B");
});

test("a document open in two windows stays current in both", async ({ page, context }) => {
  await page.locator(".title-input").fill("Chung");
  await typeInFirstLine(page, "x");
  await page.waitForTimeout(700);

  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".title-input")).toHaveValue("Chung");

  // Edit in the second window; the first one (no unsaved edits) follows.
  await other.locator("math-field").first().click();
  await other.keyboard.press("End");
  await other.keyboard.type("+y");
  await expect.poll(async () => (await readLines(page))[0].content, { timeout: 5000 }).toBe("x+y");
  await expect(page.getByText("vừa được cập nhật từ một cửa sổ khác")).toBeVisible();
});
