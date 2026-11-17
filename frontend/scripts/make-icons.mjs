// Regenerate every app icon from brand/mark.svg (the MintMath symbol):
// PWA / favicon (public/icons), Android launcher + splash (android/…/res),
// desktop (src-tauri/icons, via `tauri icon`).
//   node scripts/make-icons.mjs
import { execFileSync } from "node:child_process";
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

// Desktop: one 1024 px source, Tauri makes .icns/.ico/PNGs.
const tmp = `${root}brand/app-icon-1024.png`;
await png(icon({ size: 1024 }), tmp, 1024);

// Android: legacy + round launcher icons, adaptive foreground, splash.
const res = `${root}android/app/src/main/res/`;
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  await png(icon({ size: 48 * k }), `${res}mipmap-${d}/ic_launcher.png`, 48 * k);
  await png(icon({ size: 48 * k, radius: 24 * k }), `${res}mipmap-${d}/ic_launcher_round.png`, 48 * k);
  // Adaptive icon: 108 dp canvas, content in the central 66 dp.
  await png(
    icon({ size: 108 * k, bg: "", scale: 0.56 }),
    `${res}mipmap-${d}/ic_launcher_foreground.png`,
    108 * k,
  );
}
const splash = (w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${PAPER}"/>` +
  `<g transform="translate(${(w - Math.min(w, h) * 0.4) / 2} ${(h - Math.min(w, h) * 0.4) / 2}) scale(${(Math.min(w, h) * 0.4) / 200})" style="color:${INK}">${inner}</g></svg>`;
const splashes = {
  drawable: [480, 320],
  "drawable-port-mdpi": [320, 480],
  "drawable-port-hdpi": [480, 800],
  "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600],
  "drawable-port-xxxhdpi": [1280, 1920],
  "drawable-land-mdpi": [480, 320],
  "drawable-land-hdpi": [800, 480],
  "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960],
  "drawable-land-xxxhdpi": [1920, 1280],
};
for (const [dir, [w, h]] of Object.entries(splashes))
  await png(splash(w, h), `${res}${dir}/splash.png`, w, h);
await browser.close();
writeFileSync(
  `${res}values/ic_launcher_background.xml`,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${PAPER}</color>\n</resources>\n`,
);

execFileSync("npx", ["tauri", "icon", tmp, "-o", `${root}src-tauri/icons`], { stdio: "inherit", cwd: root });
console.log("Icons written.");
