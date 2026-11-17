import { expect, test } from "@playwright/test";

test("installable manifest and service worker; works offline after first visit", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ short_name: "MintMath", display: "standalone", lang: "vi" });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );

  // Wait until the service worker controls the page (precache complete).
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 30_000 });
  await page.locator("math-field").first().click();
  await page.keyboard.type("x^2+1");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("mathpad.doc.v1")?.includes("x^2+1")))
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("math-field")).toHaveCount(1);
  await expect(page.getByText("Ngoại tuyến")).toBeVisible();
  const latex = await page.evaluate(() =>
    (document.querySelector("math-field") as HTMLElement & { getValue: () => string }).getValue(),
  );
  expect(latex).toBe("x^2+1");
  // Math fonts come from the precache.
  const fontsOk = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check("16px KaTeX_Main");
  });
  expect(fontsOk).toBe(true);
  await context.setOffline(false);
});
