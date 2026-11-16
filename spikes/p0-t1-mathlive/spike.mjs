// Run: node spike.mjs (from frontend/ for module resolution)
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const ML = path.resolve("../../frontend/node_modules/mathlive");
const srv = http.createServer((req, res) => {
  const p = req.url === "/" ? path.resolve("index.html") : path.join(ML, req.url.split("?")[0]);
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", p.endsWith("js") || p.endsWith("mjs") ? "text/javascript" : p.endsWith("html") ? "text/html" : "application/octet-stream");
  res.end(fs.readFileSync(p));
}).listen(5199);
const b = await chromium.launch();
const pg = await b.newPage();
pg.on("console", (m) => console.log("console:", m.text()));
await pg.goto("http://localhost:5199/");
await pg.waitForFunction(() => window.ready && customElements.get("math-field"));
const cases = String.raw`\begin{cases}x+y=1\\x-y=2\end{cases}`;
const bmat = String.raw`\begin{bmatrix}1&2\\3&4\end{bmatrix}`;
const aug = String.raw`\left[\begin{array}{ccc|c}1&1&2&3\\2&3&5&7\end{array}\right]`;
const aug2 = String.raw`\left\lbrack\begin{array}{ccc|c}1&1&2&3\\2&3&5&7\end{array}\right\rbrack`;
for (const [name, tex] of [["cases", cases], ["bmatrix", bmat], ["augmented", aug], ["augmented2", aug2]]) {
  const r = await pg.evaluate(async (tex) => {
    const mf = document.getElementById("mf");
    mf.value = tex;
    await new Promise((r) => setTimeout(r, 100));
    const out = mf.getValue("latex");
    const html = mf.shadowRoot.innerHTML;
    const hasRule = /ML__.*(vertical|separator)|border-(left|right)/.test(html) || html.includes("solid");
    // try moving into a cell and typing
    mf.focus();
    mf.executeCommand("moveToMathfieldStart");
    mf.executeCommand("moveToNextChar");
    mf.executeCommand("moveToNextChar");
    mf.executeCommand(["insert", "9"]);
    const afterType = mf.getValue("latex");
    let afterAddRow = null, afterAddCol = null;
    try { mf.executeCommand("addRowAfter"); afterAddRow = mf.getValue("latex"); } catch (e) { afterAddRow = "ERR " + e; }
    try { mf.executeCommand("addColumnAfter"); afterAddCol = mf.getValue("latex"); } catch (e) { afterAddCol = "ERR " + e; }
    return { out, hasRule, afterType, afterAddRow, afterAddCol };
  }, tex);
  console.log("==", name, "\n in :", tex, "\n", JSON.stringify(r, null, 1));
}
await pg.screenshot({ path: "shot.png" });
// render all for screenshot
await pg.evaluate((t) => { document.getElementById("mf").value = t; }, aug);
await pg.screenshot({ path: "aug.png" });
await b.close(); srv.close();
