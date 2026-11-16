// Open a file chosen by the user: MathPad document, LaTeX, or library backup.
import { DocFormatError, parseDoc } from "./docFormat";
import { importBackup, isBackup } from "./library";
import { importTex } from "./texImport";
import type { Doc } from "./types";

export type ImportOutcome = { kind: "doc"; doc: Doc; message: string } | { kind: "backup"; message: string };

export const ACCEPTED_FILES = ".mathpad.json,.json,.tex,.ltx,application/json,text/x-tex,application/x-tex";

export async function importFile(file: File): Promise<ImportOutcome> {
  const text = await file.text();
  const name = file.name.toLowerCase();
  const looksJson = /^\s*[[{]/.test(text);
  const isTex =
    name.endsWith(".tex") ||
    name.endsWith(".ltx") ||
    (!looksJson && /\\(begin|documentclass|section)\b/.test(text));
  if (isTex) {
    const { doc, skipped } = importTex(text);
    if (!doc.title) doc.title = file.name.replace(/\.(tex|ltx)$/i, "");
    const extra = skipped.length ? ` (bỏ qua: ${skipped.join(", ")})` : "";
    return { kind: "doc", doc, message: `Đã nhập LaTeX từ ${file.name}${extra}` };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DocFormatError("Tệp không phải JSON hay LaTeX hợp lệ.");
  }
  if (isBackup(data)) {
    const r = await importBackup(data);
    return {
      kind: "backup",
      message: `Đã khôi phục: ${r.added} bài mới, ${r.updated} bài cập nhật, ${r.skipped} bài bỏ qua.`,
    };
  }
  return { kind: "doc", doc: parseDoc(data), message: `Đã mở ${file.name}` };
}
