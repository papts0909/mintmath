// Export without the server: .tex via the TS port of the backend builder,
// PDF via the browser's print dialog ("Save as PDF" works on desktop, Android
// and iOS), PNG by rasterising a print layout rendered with MathLive.
import { convertLatexToMarkup } from "mathlive";
import "mathlive/static.css";
import { docFileName } from "../core/docFormat";
import { toDisplay } from "../core/displayLatex";
import { buildTex } from "../core/texBuilder";
import type { Doc, Line } from "../core/types";

const PRINT_ROOT_ID = "print-root";

export function texFileName(title: string): string {
  return docFileName(title).replace(/\.mintmath\.json$/, ".tex");
}

/** The .tex file, built on the device. Throws TexLineError for unsafe/invalid lines. */
export function exportTexLocal(doc: Doc): { blob: Blob; filename: string } {
  return {
    blob: new Blob([buildTex(doc)], { type: "text/x-tex;charset=utf-8" }),
    filename: texFileName(doc.title),
  };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** LaTeX for MathLive's static renderer: display form, empty placeholders dropped. */
export function printableLatex(latex: string): string {
  return toDisplay(latex).replace(/\\placeholder(\[[^\]]*\])?\{\}/g, "{}");
}

function mathMarkup(latex: string): string {
  try {
    return convertLatexToMarkup(printableLatex(latex), { defaultMode: "math" });
  } catch {
    return `<code>${escapeHtml(latex)}</code>`;
  }
}

/** HTML for the printable document (same grouping rules as the .tex export). */
export function renderPrintHtml(doc: Doc): string {
  const out: string[] = [];
  if (doc.title.trim()) out.push(`<h1>${escapeHtml(doc.title.trim())}</h1>`);
  const lines = doc.lines;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === "text") {
      out.push(line.content.trim() ? `<p>${escapeHtml(line.content)}</p>` : `<p class="gap"></p>`);
      i++;
      continue;
    }
    const block: Line[] = [line];
    let j = i + 1;
    while (j < lines.length && lines[j].type === "math" && lines[j].joinPrev) block.push(lines[j++]);
    i = j;
    const rows = block.filter((l) => l.content.trim());
    if (!rows.length) continue;
    out.push(
      `<div class="math-block">${rows.map((l) => `<div class="math-row">${mathMarkup(l.content)}</div>`).join("")}</div>`,
    );
  }
  return out.join("\n");
}

function mountPrintRoot(doc: Doc): HTMLElement {
  document.getElementById(PRINT_ROOT_ID)?.remove();
  const root = document.createElement("div");
  root.id = PRINT_ROOT_ID;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = renderPrintHtml(doc);
  document.body.appendChild(root);
  return root;
}

/** Open the browser's print dialog with a clean A4 layout of the document. */
export function printDoc(doc: Doc): void {
  const root = mountPrintRoot(doc);
  const previousTitle = document.title;
  document.title = doc.title.trim() || "MintMath";
  const cleanup = () => {
    root.remove();
    document.title = previousTitle;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  // Let fonts/layout settle before printing.
  requestAnimationFrame(() =>
    setTimeout(() => {
      window.print();
      // Some mobile browsers do not fire afterprint.
      setTimeout(() => {
        if (document.getElementById(PRINT_ROOT_ID) === root) cleanup();
      }, 60_000);
    }, 50),
  );
}

/** Render the document to a PNG image on the device. */
export async function pngLocal(doc: Doc, pixelRatio = 2): Promise<{ blob: Blob; filename: string }> {
  const { toBlob } = await import("html-to-image");
  const root = mountPrintRoot(doc);
  root.classList.add("capture");
  try {
    await document.fonts.ready;
    const blob = await toBlob(root, {
      pixelRatio,
      backgroundColor: "#ffffff",
      cacheBust: false,
      // The live node sits off-screen; draw the clone at the origin.
      style: { position: "static", left: "0", top: "0" },
    });
    if (!blob) throw new Error("Không tạo được ảnh PNG");
    return { blob, filename: texFileName(doc.title).replace(/\.tex$/, ".png") };
  } finally {
    root.remove();
  }
}

/** Page break positions (CSS px from the top of `root`) that never cut through
 *  a block, for pages `pageHeight` tall. Exported for tests. */
export function pageBreaks(
  blocks: { top: number; bottom: number }[],
  total: number,
  pageHeight: number,
): number[] {
  const breaks = [0];
  let pageStart = 0;
  for (const b of blocks) {
    if (b.bottom - pageStart > pageHeight && b.top > pageStart) {
      pageStart = b.top;
      breaks.push(pageStart);
    }
    // A single block taller than a page is cut at page height.
    while (b.bottom - pageStart > pageHeight) {
      pageStart += pageHeight;
      breaks.push(pageStart);
    }
  }
  if (total - pageStart > pageHeight) {
    while (total - pageStart > pageHeight) {
      pageStart += pageHeight;
      breaks.push(pageStart);
    }
  }
  return breaks;
}

/** A4 PDF built on the device (an image of the print layout per page). Used
 *  in the Android app, where the WebView has no print dialog. */
export async function pdfLocal(doc: Doc, pixelRatio = 2): Promise<{ blob: Blob; filename: string }> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const root = mountPrintRoot(doc);
  root.classList.add("capture");
  try {
    await document.fonts.ready;
    const style = getComputedStyle(root);
    const padTop = parseFloat(style.paddingTop);
    const padBottom = parseFloat(style.paddingBottom);
    const width = root.offsetWidth; // 794 css px = 210 mm
    const pageHeight = Math.round((width * 297) / 210) - padTop - padBottom;
    const rootTop = root.getBoundingClientRect().top;
    const blocks = Array.from(root.children).map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - rootTop - padTop, bottom: r.bottom - rootTop - padTop };
    });
    const contentHeight = root.offsetHeight - padTop - padBottom;
    const breaks = pageBreaks(blocks, contentHeight, pageHeight);

    const canvas = await toCanvas(root, {
      pixelRatio,
      backgroundColor: "#ffffff",
      style: { position: "static", left: "0", top: "0" },
    });
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const scale = pageW / width; // pt per css px
    const marginTop = padTop * scale;
    breaks.forEach((start, i) => {
      const end = i + 1 < breaks.length ? breaks[i + 1] : contentHeight;
      const sliceH = Math.max(1, end - start);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.ceil(sliceH * pixelRatio);
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("Canvas không khả dụng");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(
        canvas,
        0,
        (padTop + start) * pixelRatio,
        canvas.width,
        slice.height,
        0,
        0,
        slice.width,
        slice.height,
      );
      if (i > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/png"), "PNG", 0, marginTop, pageW, sliceH * scale);
    });
    return { blob: pdf.output("blob"), filename: texFileName(doc.title).replace(/\.tex$/, ".pdf") };
  } finally {
    root.remove();
  }
}
