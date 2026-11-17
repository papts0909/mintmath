import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { freshPage, readLines } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase("mathpad");
      req.onsuccess = req.onerror = req.onblocked = () => r(null);
    });
  });
  await freshPage(page);
});

const library = (page: import("@playwright/test").Page) =>
  page.getByRole("complementary", { name: "Thư viện bài tập" });

test("documents are kept in the library; switch, search, duplicate, delete", async ({ page }) => {
  await page.locator(".title-input").fill("Bài A");
  await page.locator("math-field").first().click();
  await page.keyboard.type("a^2");
  await page.getByRole("button", { name: "Tài liệu mới" }).click();
  await page.locator(".title-input").fill("Bài B");
  await page.locator("math-field").first().click();
  await page.keyboard.type("b+1");

  await page.getByRole("button", { name: "Thư viện", exact: true }).click();
  const lib = library(page);
  await expect(lib.getByTestId("library-item")).toHaveCount(2);
  await expect(lib.getByTestId("library-item").first()).toContainText("Bài B");
  await expect(lib.getByTestId("library-item").first()).toContainText("đang mở");

  await lib.getByRole("searchbox").fill("a^2");
  await expect(lib.getByTestId("library-item")).toHaveCount(1);
  await lib.getByRole("button", { name: /Bài A/ }).first().click();
  await expect(page.locator(".title-input")).toHaveValue("Bài A");
  expect((await readLines(page))[0].content).toBe("a^2");

  // B was saved when we switched away.
  await page.getByRole("button", { name: "Thư viện", exact: true }).click();
  await lib.getByRole("button", { name: "Nhân bản Bài B" }).click();
  await expect(lib.getByTestId("library-item")).toHaveCount(3);
  await expect(lib.getByText("Bài B (bản sao)")).toBeVisible();
  page.once("dialog", (d) => void d.accept());
  await lib.getByRole("button", { name: "Xóa Bài B (bản sao)" }).click();
  await expect(lib.getByTestId("library-item")).toHaveCount(2);

  // Survives a reload.
  await page.reload();
  await page.getByRole("button", { name: "Thư viện", exact: true }).click();
  await expect(library(page).getByTestId("library-item")).toHaveCount(2);
});

test("imports a LaTeX file into an editable document", async ({ page }) => {
  const tex = String.raw`\documentclass{article}
\begin{document}
\section*{Bài tập nhập}
Giải hệ:
\[ \begin{cases}x+y=1\\x-y=3\end{cases} \]
\begin{align*}
x &= 2 \\
y &= -1
\end{align*}
Vậy $S=\{(2;-1)\}$.
\end{document}`;
  await page.getByTestId("open-file").setInputFiles({
    name: "bai-tap.tex",
    mimeType: "text/x-tex",
    buffer: Buffer.from(tex),
  });
  await expect(page.locator(".title-input")).toHaveValue("Bài tập nhập");
  expect(await readLines(page)).toEqual([
    { type: "text", content: "Giải hệ:" },
    { type: "math", content: "\\begin{cases}x+y=1\\\\x-y=3\\end{cases}" },
    { type: "math", content: "x &= 2" },
    { type: "math", content: "y &= -1", joinPrev: true },
    { type: "math", content: "\\text{Vậy }S=\\{(2;-1)\\}\\text{.}" },
  ]);
  await page.getByRole("button", { name: "Thư viện", exact: true }).click();
  await expect(library(page).getByText("Bài tập nhập")).toBeVisible();
});

test("exported .tex imports back to the same document", async ({ page }) => {
  await page.keyboard.type("x^2");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+'");
  await page.keyboard.type("Kết luận: đúng 100%");
  const before = await readLines(page);
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "LaTeX", exact: true }).click(),
  ]);
  await page.getByRole("button", { name: "Tài liệu mới" }).click();
  await page.getByTestId("open-file").setInputFiles(await dl.path());
  await expect.poll(() => readLines(page)).toEqual(before);
});

test("backup and restore the whole library", async ({ page, browser }) => {
  await page.locator(".title-input").fill("Sao lưu 1");
  await page.locator("math-field").first().click();
  await page.keyboard.type("z");
  await page.getByRole("button", { name: "Thư viện", exact: true }).click();
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    library(page).getByRole("button", { name: "Sao lưu", exact: true }).click(),
  ]);
  const backup = JSON.parse(readFileSync((await dl.path())!, "utf-8"));
  expect(backup.type).toBe("mintmath-library");
  expect(backup.docs).toHaveLength(1);

  const other = await (await browser.newContext()).newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Thư viện", exact: true }).click();
  await library(other)
    .getByTestId("library-import")
    .setInputFiles(await dl.path());
  await expect(other.locator(".toast")).toContainText("1 bài mới");
  await expect(library(other).getByText("Sao lưu 1")).toBeVisible();
});
