import { expect, test } from "@playwright/test";
import { focusedIndex, freshPage, readLines, readStored, waitSaved } from "./helpers";

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("types 10 mixed lines with Vietnamese and survives a reload", async ({ page }) => {
  const expected: { type: "math" | "text"; content: string }[] = [];
  for (let i = 0; i < 10; i++) {
    if (i > 0) await page.keyboard.press("Enter");
    if (i % 2 === 1) {
      await page.keyboard.press("Control+'");
      const text = `Dòng ${i}: Giải và biện luận, ỹ ữ ặ đ Đ`;
      await page.keyboard.type(text);
      expected.push({ type: "text", content: text });
    } else {
      if (i > 0) await page.keyboard.press("Control+'");
      await page.keyboard.type(`x^${i}`);
      expected.push({ type: "math", content: `x^${i}` });
    }
  }
  expect(await readLines(page)).toEqual(expected);
  await waitSaved(page);
  await page.reload();
  await expect(page.locator("[data-testid=line]")).toHaveCount(10);
  expect(await readLines(page)).toEqual(expected);
});

test("types three lines and reloads", async ({ page }) => {
  await page.keyboard.type("a+b");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+'");
  await page.keyboard.type("Ta có");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+'");
  await page.keyboard.type("c");
  await waitSaved(page);
  await page.reload();
  expect(await readLines(page)).toEqual([
    { type: "math", content: "a+b" },
    { type: "text", content: "Ta có" },
    { type: "math", content: "c" },
  ]);
});

test("keyboard table works without the mouse", async ({ page }) => {
  // Enter: new line of the same type
  await page.keyboard.type("x");
  await page.keyboard.press("Enter");
  await page.keyboard.type("y");
  // Shift+Enter: joined line
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("=z");
  expect(await readLines(page)).toEqual([
    { type: "math", content: "x" },
    { type: "math", content: "y" },
    { type: "math", content: "=z", joinPrev: true },
  ]);
  expect(await focusedIndex(page)).toBe(2);

  // Arrow up / down at the edge move between lines
  await page.keyboard.press("ArrowUp");
  expect(await focusedIndex(page)).toBe(1);
  await page.keyboard.press("ArrowUp");
  expect(await focusedIndex(page)).toBe(0);
  await page.keyboard.press("ArrowDown");
  expect(await focusedIndex(page)).toBe(1);

  // Ctrl+' toggles math/text
  await page.keyboard.press("Control+'");
  expect((await readLines(page))[1].type).toBe("text");
  await page.keyboard.press("Control+'");
  expect((await readLines(page))[1].type).toBe("math");

  // Alt+Arrow moves the line
  await page.keyboard.press("Alt+ArrowUp");
  expect((await readLines(page)).map((l) => l.content)).toEqual(["y", "x", "=z"]);
  expect(await focusedIndex(page)).toBe(0);
  await page.keyboard.press("Alt+ArrowDown");
  expect((await readLines(page)).map((l) => l.content)).toEqual(["x", "y", "=z"]);

  // Backspace on an empty line deletes it and focuses the line above
  await page.keyboard.press("ArrowDown");
  expect(await focusedIndex(page)).toBe(2);
  await page.keyboard.press("Enter");
  expect(await readLines(page)).toHaveLength(4);
  await page.keyboard.press("Backspace");
  expect(await readLines(page)).toHaveLength(3);
  expect(await focusedIndex(page)).toBe(2);

  // Text line: Enter creates a text line, arrows move out
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+'");
  await page.keyboard.type("chữ");
  await page.keyboard.press("Enter");
  expect((await readLines(page)).slice(3)).toEqual([
    { type: "text", content: "chữ" },
    { type: "text", content: "" },
  ]);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("ArrowUp");
  expect(await focusedIndex(page)).toBe(2);
});

test("download and reopen a .mintmath.json file", async ({ page }) => {
  // ASCII title: headless Chromium reports non-ASCII download names as "download".
  await page.locator(".title-input").fill("Bai kiem tra");
  await page.locator("math-field").first().click();
  await page.keyboard.type("x^2");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+'");
  await page.keyboard.type("Kết luận");
  const before = await readLines(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Tải về" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Bai_kiem_tra.mintmath.json");
  const path = await download.path();

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Tài liệu mới" }).click();
  expect(await readLines(page)).toEqual([{ type: "math", content: "" }]);

  await page.getByTestId("open-file").setInputFiles(path!);
  await expect(page.locator(".title-input")).toHaveValue("Bai kiem tra");
  expect(await readLines(page)).toEqual(before);
});

test("rejects a file from a newer version", async ({ page }) => {
  await page.getByTestId("open-file").setInputFiles({
    name: "x.mathpad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 9, lines: [] })),
  });
  await expect(page.locator(".toast")).toContainText("phiên bản MintMath mới hơn");
});

test("undo/redo of line operations and Ctrl+D", async ({ page }) => {
  await page.keyboard.type("a");
  await page.keyboard.press("Control+d");
  expect((await readLines(page)).map((l) => l.content)).toEqual(["a", "a"]);
  await page.keyboard.press("Control+z");
  expect((await readLines(page)).map((l) => l.content)).toEqual(["a"]);
  await page.keyboard.press("Control+Shift+z");
  expect((await readLines(page)).map((l) => l.content)).toEqual(["a", "a"]);
  // Inside a math line, Ctrl+Z after typing is handled by MathLive.
  await page.keyboard.type("b");
  expect((await readLines(page))[1].content).toBe("ab");
  await page.keyboard.press("Control+z");
  expect((await readLines(page))[1].content).toBe("a");
});

test("pasting several lines splits them", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.keyboard.press("Control+'");
  await page.evaluate(() => navigator.clipboard.writeText("Giải:\n$x+1=0$\n\\[ x=-1 \\]"));
  await page.keyboard.press("Control+v");
  expect(await readLines(page)).toEqual([
    { type: "text", content: "Giải:" },
    { type: "math", content: "x+1=0" },
    { type: "math", content: "x=-1" },
  ]);
});

test("select lines with shift+click, copy and delete", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.keyboard.type("a");
  await page.keyboard.press("Enter");
  await page.keyboard.type("b");
  await page.keyboard.press("Enter");
  await page.keyboard.type("c");
  const gutters = page.locator(".gutter");
  await gutters.nth(0).click();
  await gutters.nth(1).click({ modifiers: ["Shift"] });
  await expect(page.getByText("Đã chọn 2 dòng")).toBeVisible();
  await page.getByRole("button", { name: "Sao chép", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("$a$\n$b$");
  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  expect((await readLines(page)).map((l) => l.content)).toEqual(["c"]);
});

test("drag a line to reorder", async ({ page }) => {
  await page.keyboard.type("a");
  await page.keyboard.press("Enter");
  await page.keyboard.type("b");
  await page.locator(".gutter").nth(1).dragTo(page.locator("[data-testid=line]").nth(0));
  expect((await readLines(page)).map((l) => l.content)).toEqual(["b", "a"]);
});

test("persisted doc matches what is shown", async ({ page }) => {
  await page.keyboard.type("q");
  await expect.poll(async () => (await readStored(page))?.lines.map((l) => l.content)).toEqual(["q"]);
});

test("layout fits a 380 px wide screen and follows the dark theme", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 760 });
  await page.keyboard.type("x^2+y^2=1");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("=r^2");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/narrow-light.png" });
  await page.getByText("⚙ Cài đặt").click();
  await page.getByRole("combobox").selectOption("dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(22, 24, 28)");
  await page.screenshot({ path: "test-results/narrow-dark.png" });
});

test("long text lines wrap; arrows leave only from the edge rows", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 760 });
  await page.keyboard.type("a");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+'");
  await page.keyboard.type(
    "Đây là một dòng chữ rất dài để kiểm tra việc xuống dòng tự động trong ô văn bản hẹp.",
  );
  await page.keyboard.press("Enter");
  await page.keyboard.type("b");
  const box = await page.locator("textarea.text-line").first().boundingBox();
  expect(box!.height).toBeGreaterThan(40); // wrapped onto several rows
  await page.keyboard.press("ArrowUp"); // from the next line, lands on the text line's end
  expect(await focusedIndex(page)).toBe(1);
  await page.keyboard.press("ArrowUp"); // moves within the wrapped text
  expect(await focusedIndex(page)).toBe(1);
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowUp");
  expect(await focusedIndex(page)).toBe(0);
});
