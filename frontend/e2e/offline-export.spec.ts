import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { exportAs, freshPage } from "./helpers";
import { typeSample } from "./sampleSteps";

// The export server is unreachable (offline, or static hosting without backend).
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/export\//, (r) => r.abort("internetdisconnected"));
  await freshPage(page);
});

test("LaTeX is built on the device and matches the server output", async ({ page }) => {
  await typeSample(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), exportAs(page, "LaTeX (.tex)")]);
  const tex = readFileSync((await dl.path())!, "utf-8");
  expect(tex).toContain("\\section*{Giải và biện luận hệ phương trình}");
  expect(tex).toContain("\\left[\\begin{array}{ccc|c}1 & 1 & 2 & 3");
  expect(tex.trimEnd().endsWith("\\end{document}")).toBe(true);
});

test("PNG is rendered on the device", async ({ page }) => {
  await typeSample(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), exportAs(page, "PNG")]);
  const png = readFileSync((await dl.path())!);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  // A4-width layout at 2x: 794 px * 2
  expect(png.readUInt32BE(16)).toBe(1588);
  // Not a blank page: a white A4 PNG compresses to a few KB.
  expect(png.length).toBeGreaterThan(40_000);
});

test("PDF falls back to the print dialog with a printable layout", async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed++;
    };
  });
  await typeSample(page);
  await exportAs(page, "PDF");
  await expect(page.locator(".export-status")).toContainText("Lưu thành PDF");
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  const root = page.locator("#print-root");
  await expect(root.locator("h1")).toHaveText("Giải và biện luận hệ phương trình");
  await expect(root.locator(".math-block")).toHaveCount(7); // the joined pair m^2-1=0 / ⇔ m=±1 is one block;
  await expect(root.locator("p").first()).toContainText("tham số m ∈ ℝ");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".toolbar")).toBeHidden();
  await expect(root).toBeVisible();
});

test("forbidden commands are still caught offline", async ({ page }) => {
  await page.getByTestId("open-file").setInputFiles({
    name: "t.mathpad.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        id: "t",
        title: "",
        updatedAt: "",
        lines: [{ id: "a", type: "math", content: "\\input{/etc/passwd}" }],
      }),
    ),
  });
  await exportAs(page, "LaTeX (.tex)");
  await expect(page.locator("[data-testid=line]").first()).toHaveClass(/has-error/);
});
