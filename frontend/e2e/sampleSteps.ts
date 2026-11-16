import { type Page } from "@playwright/test";
import { readLines } from "./helpers";

async function text(page: Page, s: string) {
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+'");
  await page.keyboard.type(s);
}

async function math(page: Page, keys: (string | { press: string })[], opts: { join?: boolean } = {}) {
  await page.keyboard.press(opts.join ? "Shift+Enter" : "Enter");
  const lines = await readLines(page);
  if (!opts.join && lines[lines.length - 1].type === "text") await page.keyboard.press("Control+'");
  for (const k of keys) {
    if (typeof k === "string") await page.keyboard.type(k);
    else await page.keyboard.press(k.press);
  }
}

const RIGHT = { press: "ArrowRight" };

/** Type the acceptance sample ("bài mẫu") using only the keyboard. */
export async function typeSample(page: Page) {
  await page.locator(".title-input").click();
  await page.keyboard.type("Giải và biện luận hệ phương trình");
  await page.keyboard.press("Tab"); // focus leaves the title
  await page.locator("math-field").first().click();
  await page.keyboard.press("Control+'");
  await page.keyboard.type("Giải và biện luận hệ phương trình sau theo tham số m ∈ ℝ:");
  await math(page, ["sys", "x+y+2z=3;2x+3y+5z=7;x+y+(m^2+1)z=m+2"]);
  await text(page, "Ma trận bổ sung của hệ:");
  await math(page, ["amat", "1,1,2,3;2,3,5,7;1,1,m^2+1,m+2"]);
  await math(page, ["d2->d2-2d1,d3->d3-d1"]);
  await math(page, ["amat", "1,1,2,3;0,1,1,1;0,0,m^2-1,m-1"]);
  await text(page, "Biện luận:");
  await math(page, ["m^2-1=0"]);
  await math(page, ["<=>m=+-1"], { join: true });
  await text(page, "• Nếu m ≠ ±1 thì hệ có nghiệm duy nhất:");
  await math(page, ["z=1/m+1", RIGHT, ",y=m/m+1", RIGHT, ",x=(2m+1)/m+1"]);
  await text(page, "• Nếu m = 1: hệ có vô số nghiệm");
  await math(page, ["sys", "x=2-z;y=1-z;zelementRbb"]);
  await text(page, "• Nếu m = −1: phương trình cuối trở thành 0z = −2, hệ vô nghiệm.");
}
