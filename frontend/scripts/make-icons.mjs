// Regenerate the PWA icons and favicon (public/icons) from brand/mark.svg
// (the MintMath symbol).
//   node scripts/make-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const root = new URL("..", import.meta.url).pathname;
const INK = "#111111";
const PAPER = "#FFFFFF";
const mark = readFileSync(`${root}brand/mark.svg`, "utf8").replace(/<!--.*?-->\s*/s, "");
const inner = mark.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

/** Square SVG: optional background, the mark scaled to `scale` of the side. */
function icon({ size = 1024, bg = PAPER, color = INK, scale = 0.84, radius = 0 }) {
  const s = (size * scale) / 200;
  const off = (size - 200 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : ""}
<g transform="translate(${off} ${off}) scale(${s})" style="color:${color}">${inner}</g></svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svg, out, w, h = w) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" style="display:block;width:${w}px;height:${h}px"></body></html>`,
  );
  await page.locator("img").evaluate((i) => i.decode());
  mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(out, await page.screenshot({ omitBackground: true }));
}

// Web / PWA
const pub = `${root}public/icons/`;
writeFileSync(`${pub}icon.svg`, icon({ size: 512, radius: 96 }));
await png(icon({ size: 192 }), `${pub}icon-192.png`, 192);
await png(icon({ size: 512 }), `${pub}icon-512.png`, 512);
await png(icon({ size: 512, scale: 0.62 }), `${pub}maskable-512.png`, 512); // inside the 80% safe zone
await png(icon({ size: 180 }), `${pub}apple-touch-icon.png`, 180);

await browser.close();
console.log("Icons written.");
