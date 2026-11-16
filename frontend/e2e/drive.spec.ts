import { expect, test } from "@playwright/test";
import { fileText, installFakeGoogle } from "./fakeGoogle";
import { freshPage, readLines } from "./helpers";

test.skip(
  !process.env.VITE_GOOGLE_CLIENT_ID,
  "Drive E2E needs the dev server started with VITE_GOOGLE_CLIENT_ID (any value; Google is faked)",
);

test("save to Drive, open in another browser via Picker, edit, overwrite", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const drive = await installFakeGoogle(pageA);
  await freshPage(pageA);
  await pageA.locator(".title-input").fill("Bài mẫu");
  await pageA.locator("math-field").first().click();
  await pageA.keyboard.type("x^2=1");

  await pageA.getByRole("button", { name: "Đăng nhập Google" }).click();
  await expect(pageA.getByText("Người thử")).toBeVisible();
  await pageA.getByRole("button", { name: "Lưu lên Drive" }).click();
  await expect(pageA.getByText(/Đã lưu lên Drive lúc/)).toBeVisible();
  expect(drive.files.size).toBe(1);
  const [id, file] = [...drive.files.entries()][0];
  expect(file.name).toBe("Bài_mẫu.mathpad.json");
  expect(JSON.parse(fileText(file.content)).lines[0].content).toBe("x^2=1");

  // Another browser: open through the Picker, edit, save over the same file.
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  const driveB = await installFakeGoogle(pageB);
  driveB.files.set(id, file);
  driveB.pickNext(id);
  await freshPage(pageB);
  await pageB.getByRole("button", { name: "Đăng nhập Google" }).click();
  await pageB.getByRole("button", { name: "Mở từ Drive" }).click();
  await expect(pageB.locator(".title-input")).toHaveValue("Bài mẫu");
  await pageB.locator("math-field").first().click();
  await pageB.keyboard.press("End");
  await pageB.keyboard.type("+y");
  await expect.poll(async () => (await readLines(pageB))[0].content).toBe("x^2=1+y");
  await pageB.keyboard.press("Control+s");
  await expect(pageB.getByText(/Đã lưu lên Drive lúc/)).toBeVisible();
  expect(driveB.files.size).toBe(1);
  expect(JSON.parse(fileText(driveB.files.get(id)!.content)).lines[0].content).toBe("x^2=1+y");

  // Reopen in A: sees the change.
  drive.files.set(id, driveB.files.get(id)!);
  drive.pickNext(id);
  pageA.once("dialog", (d) => void d.accept());
  await pageA.getByRole("button", { name: "Mở từ Drive" }).click();
  await expect.poll(async () => (await readLines(pageA))[0].content).toBe("x^2=1+y");
  await ctxA.close();
  await ctxB.close();
});

test("expired token mid-save is refreshed and the save goes through", async ({ page }) => {
  const drive = await installFakeGoogle(page);
  await freshPage(page);
  await page.keyboard.type("a");
  await page.getByRole("button", { name: "Đăng nhập Google" }).click();
  await expect(page.getByRole("button", { name: "Lưu lên Drive" })).toBeVisible();
  drive.expireNext(1);
  await page.getByRole("button", { name: "Lưu lên Drive" }).click();
  await expect(page.getByText(/Đã lưu lên Drive lúc/)).toBeVisible();
  expect(drive.files.size).toBe(1);
  expect(drive.tokensIssued).toBe(2);
});

test("save copy creates a new file; a deleted file offers 'save as new'", async ({ page }) => {
  const drive = await installFakeGoogle(page);
  await freshPage(page);
  await page.keyboard.type("b");
  await page.getByRole("button", { name: "Đăng nhập Google" }).click();
  await page.getByRole("button", { name: "Lưu lên Drive" }).click();
  await expect(page.getByText(/Đã lưu lên Drive lúc/)).toBeVisible();
  await page.getByRole("button", { name: "Lưu bản sao" }).click();
  await expect(page.getByText("Đã lưu bản sao lên Drive.")).toBeVisible();
  expect(drive.files.size).toBe(2);

  drive.files.clear(); // deleted on Drive
  await page.getByRole("button", { name: "Lưu lên Drive" }).click();
  await expect(page.getByRole("alert")).toContainText("Không tìm thấy file trên Drive");
  await page.getByRole("button", { name: "Lưu thành file mới" }).click();
  await expect(page.getByText("Đã lưu lên Drive.")).toBeVisible();
  expect(drive.files.size).toBe(1);
});

test("refusing permission shows a clear message", async ({ page }) => {
  const drive = await installFakeGoogle(page);
  await freshPage(page);
  drive.denyNext();
  await page.getByRole("button", { name: "Đăng nhập Google" }).click();
  await expect(page.getByRole("alert")).toContainText("từ chối cấp quyền");
});

test("network loss while saving is reported", async ({ page }) => {
  await installFakeGoogle(page);
  await freshPage(page);
  await page.getByRole("button", { name: "Đăng nhập Google" }).click();
  await page.route("https://www.googleapis.com/upload/**", (r) => r.abort("internetdisconnected"));
  await page.getByRole("button", { name: "Lưu lên Drive" }).click();
  await expect(page.getByRole("alert")).toContainText("Mất kết nối mạng");
});

test("PDF can be saved to Drive", async ({ page }) => {
  const drive = await installFakeGoogle(page);
  await freshPage(page);
  await page.keyboard.type("x");
  await page.getByRole("button", { name: "Đăng nhập Google" }).click();
  await page.getByRole("button", { name: "Lưu PDF lên Drive" }).click();
  await expect(page.getByText(/Đã lưu .*\.pdf lên Drive/)).toBeVisible();
  const pdf = [...drive.files.values()][0];
  expect(pdf.mimeType).toBe("application/pdf");
  expect(pdf.content.startsWith("%PDF")).toBe(true);
});
