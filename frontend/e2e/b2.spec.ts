import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { docKeys, FAKE_B2, installFakeB2, textOf, type FakeBucket } from "./fakeB2";
import { freshPage, readLines } from "./helpers";

async function start(page: Page, bucket: FakeBucket) {
  await installFakeB2(page, bucket);
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase("mathpad");
      req.onsuccess = req.onerror = req.onblocked = () => r(null);
    });
  });
  await freshPage(page);
}

const panel = (page: Page) => page.getByRole("complementary", { name: "Thư viện bài tập" });

async function connect(page: Page, overrides: Partial<typeof FAKE_B2> = {}) {
  const c = { ...FAKE_B2, ...overrides };
  const form = page.getByRole("form", { name: "Kết nối Backblaze B2" });
  await form.getByLabel("keyID").fill(c.keyId);
  await form.getByLabel("applicationKey").fill(c.appKey);
  await form.getByLabel("Tên bucket").fill(c.bucket);
  await form.getByLabel("Endpoint").fill(c.endpoint);
  await form.getByRole("button", { name: "Kết nối" }).click();
}

test("connect with your own key: validation, wrong key, then success", async ({ page }) => {
  const bucket: FakeBucket = new Map();
  await start(page, bucket);

  await page.getByRole("button", { name: "☁ Kết nối Backblaze B2" }).click();
  await expect(panel(page).getByRole("tab", { name: "☁ Backblaze B2" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(panel(page).getByText("Lưu bài lên Backblaze B2")).toBeVisible();

  await connect(page, { endpoint: "example.com" });
  await expect(panel(page).getByRole("alert")).toContainText("Endpoint");

  await connect(page, { keyId: "004wrongwrongwrongwrong001" });
  await expect(panel(page).getByRole("alert")).toContainText("B2 từ chối khóa");

  await connect(page);
  await expect(panel(page).getByText(`Đã kết nối bucket ${FAKE_B2.bucket}.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "☁ Lưu lên B2" })).toBeVisible();

  // The connection is remembered on this device.
  await page.reload();
  await expect(page.getByRole("button", { name: "☁ Lưu lên B2" })).toBeVisible();
});

test("save with Ctrl+S, rename, open on another device, sync both ways", async ({ page, browser }) => {
  const bucket: FakeBucket = new Map();
  await start(page, bucket);
  await page.getByRole("button", { name: "☁ Kết nối Backblaze B2" }).click();
  await connect(page);
  await page.getByRole("button", { name: "Đóng thư viện" }).click();

  await page.locator(".title-input").fill("Bài 1");
  await page.locator("math-field").first().click();
  await page.keyboard.type("x^2");
  await page.keyboard.press("Control+s");
  await expect.poll(() => docKeys(bucket)).toHaveLength(1);
  const [key1] = docKeys(bucket);
  expect(key1).toMatch(/^mathpad\/Bai-1__.+\.mathpad\.json$/);
  expect(JSON.parse(textOf(bucket, key1)).lines[0].content).toBe("x^2");
  await expect(page.getByText(/Đã lưu lên B2 lúc/).first()).toBeVisible();

  // Renaming replaces the object instead of leaving a stale copy.
  await page.locator(".title-input").fill("Bài 1 sửa");
  await page.getByRole("button", { name: "☁ Lưu lên B2" }).click();
  await expect.poll(() => docKeys(bucket)).toEqual([key1.replace("Bai-1__", "Bai-1-sua__")]);

  // Another device: connect, open from B2.
  const ctx2 = await browser.newContext();
  const other = await ctx2.newPage();
  await start(other, bucket);
  await other.getByRole("button", { name: "☁ Kết nối Backblaze B2" }).click();
  await connect(other);
  await expect(panel(other).getByTestId("b2-item")).toHaveCount(1);
  await panel(other)
    .getByTestId("b2-item")
    .getByRole("button", { name: /^Bai 1 sua/ })
    .click();
  await expect(other.locator(".title-input")).toHaveValue("Bài 1 sửa");
  expect((await readLines(other))[0].content).toBe("x^2");

  // Edit there and sync.
  await other.locator("math-field").first().click();
  await other.keyboard.press("End");
  await other.keyboard.type("+1");
  await expect.poll(async () => (await readLines(other))[0].content).toBe("x^2+1");
  await other.getByRole("button", { name: /☁ mathpad-test/ }).click();
  await panel(other).getByRole("button", { name: "⇅ Đồng bộ thư viện" }).click();
  await expect(panel(other).getByText(/Đồng bộ xong: 1 bài lên B2/)).toBeVisible();

  // First device syncs and receives the edit.
  await page.getByRole("button", { name: /☁ mathpad-test/ }).click();
  await panel(page).getByRole("button", { name: "⇅ Đồng bộ thư viện" }).click();
  await expect(panel(page).getByText(/1 bài về máy/)).toBeVisible();
  await expect.poll(async () => (await readLines(page))[0].content).toBe("x^2+1");
  await ctx2.close();
});

test("edits on both devices keep both versions", async ({ page, browser }) => {
  const bucket: FakeBucket = new Map();
  await start(page, bucket);
  await page.getByRole("button", { name: "☁ Kết nối Backblaze B2" }).click();
  await connect(page);
  await page.getByRole("button", { name: "Đóng thư viện" }).click();
  await page.locator(".title-input").fill("Chung");
  await page.locator("math-field").first().click();
  await page.keyboard.type("a");
  await page.keyboard.press("Control+s");
  await expect.poll(() => docKeys(bucket)).toHaveLength(1);

  const ctx2 = await browser.newContext();
  const other = await ctx2.newPage();
  await start(other, bucket);
  await other.getByRole("button", { name: "☁ Kết nối Backblaze B2" }).click();
  await connect(other);
  await panel(other).getByTestId("b2-item").first().getByRole("button").first().click();
  await other.locator("math-field").first().click();
  await other.keyboard.press("End");
  await other.keyboard.type("b");
  await expect.poll(async () => (await readLines(other))[0].content).toBe("ab");
  await other.keyboard.press("Control+s");
  await expect(other.getByText(/Đã lưu lên B2 lúc/).first()).toBeVisible();

  await page.locator("math-field").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type("c");
  await expect.poll(async () => (await readLines(page))[0].content).toBe("ac");
  await page.getByRole("button", { name: /☁ mathpad-test/ }).click();
  await panel(page).getByRole("button", { name: "⇅ Đồng bộ thư viện" }).click();
  await expect(panel(page).getByText(/sửa ở cả hai nơi/)).toBeVisible();
  await panel(page).getByRole("tab", { name: "💻 Trên máy" }).click();
  await expect(panel(page).getByText("Chung (bản trên B2)")).toBeVisible();
  await ctx2.close();
});

test("other files: upload, export .tex + PDF, import .tex, download, delete, disconnect", async ({
  page,
}) => {
  const bucket: FakeBucket = new Map();
  await start(page, bucket);
  await page.getByRole("button", { name: "☁ Kết nối Backblaze B2" }).click();
  await connect(page);

  await panel(page)
    .getByTestId("b2-upload")
    .setInputFiles({
      name: "de-thi.tex",
      mimeType: "text/x-tex",
      buffer: Buffer.from("\\section*{Đề thi}\nTính:\n\\[ \\int_0^1 x\\,dx \\]"),
    });
  await expect(panel(page).getByTestId("b2-file")).toHaveCount(1);
  await panel(page).getByRole("button", { name: "Nhập de-thi.tex" }).click();
  await expect(page.locator(".title-input")).toHaveValue("Đề thi");

  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    panel(page).getByRole("button", { name: "Tải về de-thi.tex" }).click(),
  ]);
  expect(readFileSync((await dl.path())!, "utf-8")).toContain("\\int_0^1");

  await page.route(/\/api\/export\//, (r) => r.abort("internetdisconnected"));
  await page.getByRole("button", { name: "⬆ B2" }).click();
  await expect
    .poll(() => [...bucket.keys()].sort())
    .toEqual(expect.arrayContaining(["mathpad/de-thi.tex", "mathpad/Đề_thi.tex", "mathpad/Đề_thi.pdf"]));
  expect(bucket.get("mathpad/Đề_thi.pdf")!.body.subarray(0, 5).toString()).toBe("%PDF-");

  page.once("dialog", (d) => void d.accept());
  await panel(page).getByRole("button", { name: "Xóa de-thi.tex trên B2" }).click();
  await expect.poll(() => bucket.has("mathpad/de-thi.tex")).toBe(false);

  page.once("dialog", (d) => void d.accept());
  await panel(page).getByRole("button", { name: "Ngắt kết nối B2" }).click();
  await expect(page.getByRole("button", { name: "☁ Kết nối Backblaze B2" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("mathpad.b2.v1"))).toBeNull();
});

/** The bucket blocks this page (no CORS rule) until `state.allowed` holds
 *  the page's origin: signed calls fail like a CORS error, while a no-cors
 *  request to the host still goes through. */
async function corsGate(page: Page, state: { allowed: string[] }) {
  await page.route(`https://${FAKE_B2.endpoint}/**`, async (r) => {
    if (state.allowed.includes("http://localhost:5173")) return r.fallback();
    const signed = "authorization" in (await r.request().allHeaders());
    if (signed || r.request().method() === "OPTIONS") return r.abort("failed");
    return r.fulfill({ status: 403, body: "" });
  });
}

/** Backblaze's native API (authorize, list buckets, update bucket). */
async function fakeNativeApi(page: Page, state: { allowed: string[]; rules?: unknown[] }) {
  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, POST",
  };
  const json = (r: Parameters<Parameters<Page["route"]>[1]>[0], status: number, body: unknown) =>
    r.fulfill({
      status,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  await page.route("https://api*.backblazeb2.com/**", async (r) => {
    const req = r.request();
    if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    if (url.pathname.endsWith("/b2_authorize_account")) {
      const auth = (await req.allHeaders())["authorization"] ?? "";
      if (auth !== "Basic " + Buffer.from("masterkey:mastersecret").toString("base64"))
        return json(r, 401, { code: "unauthorized", message: "bad key" });
      return json(r, 200, {
        accountId: "acc",
        authorizationToken: "tok",
        apiInfo: { storageApi: { apiUrl: "https://api004.backblazeb2.com" } },
      });
    }
    const body = req.postDataJSON() as { bucketName?: string; corsRules?: { allowedOrigins: string[] }[] };
    if (url.pathname.endsWith("/b2_list_buckets"))
      return json(r, 200, {
        buckets: body.bucketName === FAKE_B2.bucket ? [{ bucketId: "b1", corsRules: [] }] : [],
      });
    if (url.pathname.endsWith("/b2_update_bucket")) {
      state.rules = body.corsRules;
      state.allowed = body.corsRules!.flatMap((x) => x.allowedOrigins);
      return json(r, 200, { corsRules: body.corsRules });
    }
    return json(r, 404, { code: "not_found" });
  });
}

const corsForm = (page: Page) => panel(page).getByRole("form", { name: "Bật truy cập cho bản web" });

test("missing CORS rule: MathPad enables it with the Master key, then connects", async ({ page }) => {
  const bucket: FakeBucket = new Map();
  const state: { allowed: string[]; rules?: unknown[] } = { allowed: [] };
  await start(page, bucket);
  await corsGate(page, state);
  await fakeNativeApi(page, state);
  await page.getByRole("button", { name: "☁ Kết nối Backblaze B2" }).click();
  await connect(page);
  const alert = panel(page).getByRole("alert");
  await expect(alert).toContainText("chưa cho phép trang http://localhost:5173");
  await expect(alert).not.toContainText(/github|docs\/|scripts\//i);
  const help = panel(page).getByRole("region", { name: "Bật truy cập cho bản web" });
  await expect(help).toBeVisible();
  await expect(help).not.toContainText(/github|docs\//i);

  // Wrong key first.
  await corsForm(page).getByLabel("keyID của Master Application Key").fill("masterkey");
  await corsForm(page).getByLabel("applicationKey của Master Application Key").fill("wrong");
  await corsForm(page).getByRole("button", { name: "Bật truy cập và kết nối lại" }).click();
  await expect(alert).toContainText("Backblaze không nhận khóa này");

  await corsForm(page).getByLabel("applicationKey của Master Application Key").fill("mastersecret");
  await corsForm(page).getByRole("button", { name: "Bật truy cập và kết nối lại" }).click();
  await expect(panel(page).getByText(`Đã kết nối bucket ${FAKE_B2.bucket}.`)).toBeVisible();
  expect(state.rules).toEqual([
    expect.objectContaining({
      corsRuleName: "mathpad-web",
      allowedOrigins: ["http://localhost:5173"],
      allowedOperations: ["s3_get", "s3_head", "s3_put", "s3_delete"],
    }),
  ]);
  await expect(help).toBeHidden();
  // The Master key is not kept anywhere on the device.
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).not.toContain("mastersecret");
  expect(stored).not.toContain("masterkey");
});

test("when the browser cannot change the bucket, the app shows a ready-to-copy command", async ({ page }) => {
  await start(page, new Map());
  await corsGate(page, { allowed: [] });
  await page.route("https://api*.backblazeb2.com/**", (r) => r.abort("failed"));
  await page.getByRole("button", { name: "☁ Kết nối Backblaze B2" }).click();
  await connect(page);
  await corsForm(page).getByLabel("keyID của Master Application Key").fill("masterkey");
  await corsForm(page).getByLabel("applicationKey của Master Application Key").fill("mastersecret");
  await corsForm(page).getByRole("button", { name: "Bật truy cập và kết nối lại" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("Dùng cách 2");
  const help = panel(page).getByRole("region", { name: "Bật truy cập cho bản web" });
  await expect(help.getByText("curl -fsSLO http://localhost:5173/b2-cors.mjs")).toBeVisible();
  await expect(
    help.getByText(`node b2-cors.mjs --bucket ${FAKE_B2.bucket} --origin http://localhost:5173`),
  ).toBeVisible();
  // The command downloads the script from the app itself.
  const res = await page.request.get("/b2-cors.mjs");
  expect(res.ok()).toBe(true);
  expect(await res.text()).toContain("export async function setMathpadCors");
});

test("a network that blocks Backblaze is not reported as a CORS problem", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.route(`https://${FAKE_B2.endpoint}/**`, (r) => r.abort("blockedbyclient"));
  await freshPage(page);
  await page.getByRole("button", { name: "☁ Kết nối Backblaze B2" }).click();
  await connect(page);
  await expect(panel(page).getByRole("alert")).toContainText("chặn Backblaze");
  await expect(panel(page).getByRole("region", { name: "Bật truy cập cho bản web" })).toHaveCount(0);
});
