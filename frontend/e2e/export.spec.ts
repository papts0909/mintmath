import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { freshPage } from "./helpers";
import { typeSample } from "./sampleSteps";

async function loadDoc(page: Page, lines: { id: string; type: string; content: string }[], title = "") {
  await page.getByTestId("open-file").setInputFiles({
    name: "t.mathpad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, id: "t", title, updatedAt: "", lines })),
  });
  await expect(page.locator("[data-testid=line]")).toHaveCount(lines.length);
}

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("exports the typed sample as .tex and a valid PDF", async ({ page }) => {
  await typeSample(page);

  const [texDl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "LaTeX", exact: true }).click(),
  ]);
  const tex = readFileSync((await texDl.path())!, "utf-8");
  expect(tex).toContain("\\section*{Giải và biện luận hệ phương trình}");
  expect(tex).toContain("\\left[\\begin{array}{ccc|c}1 & 1 & 2 & 3");
  expect(tex).toContain("\\begin{align*}");

  const started = Date.now();
  const [pdfDl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "PDF", exact: true }).click(),
  ]);
  const pdf = readFileSync((await pdfDl.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(Date.now() - started).toBeLessThan(5000);

  const [pngDl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "PNG", exact: true }).click(),
  ]);
  const png = readFileSync((await pngDl.path())!);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
});

test("a forbidden command is rejected and its line is highlighted", async ({ page }) => {
  await loadDoc(page, [
    { id: "a", type: "math", content: "x+1" },
    { id: "b", type: "math", content: "\\input{/etc/passwd}" },
  ]);
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(page.locator("[data-testid=line]").nth(1)).toHaveClass(/has-error/);
  await expect(page.locator(".export-menu .status.error")).toContainText("dòng 2");
});

test("a LaTeX error highlights the offending line", async ({ page }) => {
  await loadDoc(page, [
    { id: "a", type: "text", content: "Mở đầu" },
    { id: "b", type: "math", content: "x" },
    { id: "c", type: "math", content: "\\nosuchmacro{1}" },
  ]);
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(page.locator("[data-testid=line]").nth(2)).toHaveClass(/has-error/);
  await expect(page.locator(".line-error")).toBeVisible();
  // Editing the line clears the highlight.
  await page.locator("math-field").nth(1).click();
  await page.keyboard.press("End");
  await page.keyboard.type("y");
  await expect(page.locator(".has-error")).toHaveCount(1);
});

test("print preview shows the PDF in the page", async ({ page }) => {
  await page.keyboard.type("x^2");
  await page.getByRole("button", { name: "Xem trước" }).click();
  await expect(page.getByRole("dialog", { name: "Xem trước bản in" })).toBeVisible();
  await expect(page.locator(".preview iframe")).toHaveAttribute("src", /^blob:/);
  await page.getByRole("button", { name: "Đóng" }).click();
  await expect(page.locator(".preview")).toHaveCount(0);
});

test("shortcut panel lists every shortcut and filters", async ({ page }) => {
  await page.keyboard.press("Control+/");
  const panel = page.getByRole("complementary", { name: "Bảng lệnh tắt" });
  await expect(panel).toBeVisible();
  const { SHORTCUTS } = await import("../src/core/shortcuts");
  await expect(panel.getByTestId("shortcut-row")).toHaveCount(SHORTCUTS.length);
  await panel.getByRole("searchbox").fill("rbb");
  await expect(panel.getByTestId("shortcut-row")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});
