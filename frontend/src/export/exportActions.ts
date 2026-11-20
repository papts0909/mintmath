// Export commands (LaTeX, PDF, PNG, preview, print, to B2) with one shared
// busy/status state, used by the File menu and the toolbar's Export button.
import { create } from "zustand";
import {
  downloadBlob,
  ExportError,
  exportDoc,
  isServerUnavailable,
  SERVER_ENABLED,
} from "../api/exportClient";
import { uploadFileToB2, useB2 } from "../cloud/b2Actions";
import { useDocStore } from "../core/docStore";
import { TexLineError } from "../core/texBuilder";
import { exportTexLocal, pdfLocal, pngLocal, printDoc } from "./localExport";

type Status = { kind: "info" | "error"; text: string } | null;

export const useExport = create<{ busy: string | null; status: Status }>()(() => ({
  busy: null,
  status: null,
}));

const OFFLINE_PDF_HINT =
  "Không có máy chủ xuất PDF: đã mở hộp thoại In — chọn “Lưu thành PDF” (trên điện thoại: In → Chia sẻ/Lưu).";

const doc = () => useDocStore.getState().doc;

async function run(label: string, fn: () => Promise<Status | void>): Promise<void> {
  if (useExport.getState().busy) return;
  useExport.setState({ busy: label, status: { kind: "info", text: `Đang xuất ${label}…` } });
  useDocStore.getState().setError(null);
  try {
    useExport.setState({ status: (await fn()) ?? null });
  } catch (e) {
    const lineId = e instanceof ExportError || e instanceof TexLineError ? e.lineId : null;
    const message = e instanceof Error ? e.message : "Xuất file thất bại";
    if (lineId) {
      useDocStore.getState().setError({ lineId, message });
      const idx = doc().lines.findIndex((l) => l.id === lineId);
      useExport.setState({ status: { kind: "error", text: `Lỗi ở dòng ${idx + 1}: ${message}` } });
      useDocStore.getState().focusLine(lineId);
    } else {
      useExport.setState({ status: { kind: "error", text: message } });
    }
  } finally {
    useExport.setState({ busy: null });
  }
}

/** Try the server; when it is unreachable, run the on-device fallback. */
async function withFallback(server: () => Promise<void>, local: () => Promise<Status | void>) {
  if (!SERVER_ENABLED) return local();
  try {
    await server();
  } catch (e) {
    if (isServerUnavailable(e)) return local();
    throw e;
  }
}

const printNow = (): Status => {
  exportTexLocal(doc()); // same validation as the .tex export
  printDoc(doc());
  return null;
};

export const exportTex = () =>
  run("LaTeX", async () => {
    const { blob, filename } = exportTexLocal(doc());
    downloadBlob(blob, filename);
  });

export const exportPdf = () =>
  run("PDF", () =>
    withFallback(
      async () => {
        const { blob, filename } = await exportDoc("pdf", doc());
        downloadBlob(blob, filename);
      },
      async () => {
        printNow();
        return { kind: "info", text: OFFLINE_PDF_HINT };
      },
    ),
  );

export const exportPng = () =>
  run("PNG", () =>
    withFallback(
      async () => {
        const { blob, filename } = await exportDoc("png", doc());
        downloadBlob(blob, filename);
      },
      async () => {
        exportTexLocal(doc());
        const { blob, filename } = await pngLocal(doc());
        downloadBlob(blob, filename);
      },
    ),
  );

export const previewPdf = (onPreview: (url: string) => void) =>
  run("bản xem trước", () =>
    withFallback(
      async () => {
        const { blob } = await exportDoc("pdf", doc());
        onPreview(URL.createObjectURL(blob));
      },
      async () => printNow(),
    ),
  );

export const printPage = () => run("bản in", async () => printNow());

/** Upload the .tex and a PDF of the open document to B2. The PDF comes from
 *  the export server when there is one, otherwise it is built on the device. */
export const exportToB2 = () =>
  run("lên B2", async () => {
    const tex = exportTexLocal(doc());
    let pdf: { blob: Blob; filename: string };
    try {
      if (!SERVER_ENABLED) throw new ExportError("no server", 0, null, true);
      pdf = await exportDoc("pdf", doc());
    } catch (e) {
      if (!isServerUnavailable(e)) throw e;
      pdf = await pdfLocal(doc());
    }
    const okTex = await uploadFileToB2(tex.blob, tex.filename);
    const okPdf = okTex && (await uploadFileToB2(pdf.blob, pdf.filename));
    return okPdf
      ? { kind: "info", text: `Đã lưu ${tex.filename} và ${pdf.filename} lên B2.` }
      : { kind: "error", text: useB2.getState().message?.text ?? "Không lưu được lên B2." };
  });
