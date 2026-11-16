import { useState } from "react";
import {
  downloadBlob,
  ExportError,
  exportDoc,
  isServerUnavailable,
  SERVER_ENABLED,
} from "../api/exportClient";
import { useDocStore } from "../core/docStore";
import { TexLineError } from "../core/texBuilder";
import { uploadBlobToDrive, useDriveUi } from "../drive/driveActions";
import { exportTexLocal, pdfLocal, pngLocal, printDoc } from "../export/localExport";
import { isNativeApp } from "../native";

interface Props {
  onPreview: (url: string) => void;
}

type Status = { kind: "info" | "error"; text: string } | null;

// Android app: no print dialog in the WebView, so PDFs are built on the device.
const NATIVE = isNativeApp();

const OFFLINE_PDF_HINT =
  "Không có máy chủ xuất PDF: đã mở hộp thoại In — chọn “Lưu thành PDF” (trên điện thoại: In → Chia sẻ/Lưu).";

export default function ExportMenu({ onPreview }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const signedIn = useDriveUi((s) => s.signedIn);
  const doc = () => useDocStore.getState().doc;

  const run = async (label: string, fn: () => Promise<Status | void>) => {
    setBusy(label);
    setStatus({ kind: "info", text: `Đang xuất ${label}…` });
    useDocStore.getState().setError(null);
    try {
      setStatus((await fn()) ?? null);
    } catch (e) {
      const lineId = e instanceof ExportError || e instanceof TexLineError ? e.lineId : null;
      const message = e instanceof Error ? e.message : "Xuất file thất bại";
      if (lineId) {
        useDocStore.getState().setError({ lineId, message });
        const idx = doc().lines.findIndex((l) => l.id === lineId);
        setStatus({ kind: "error", text: `Lỗi ở dòng ${idx + 1}: ${message}` });
        useDocStore.getState().focusLine(lineId);
      } else {
        setStatus({ kind: "error", text: message });
      }
    } finally {
      setBusy(null);
    }
  };

  /** Try the server; when it is unreachable, run the on-device fallback. */
  const withFallback = async (server: () => Promise<void>, local: () => Promise<Status | void>) => {
    if (!SERVER_ENABLED) return local();
    try {
      await server();
    } catch (e) {
      if (isServerUnavailable(e)) return local();
      throw e;
    }
  };

  const tex = () =>
    run("LaTeX", async () => {
      const { blob, filename } = exportTexLocal(doc());
      downloadBlob(blob, filename);
    });

  const print = (): Status => {
    exportTexLocal(doc()); // same validation as the .tex export
    printDoc(doc());
    return null;
  };

  const pdf = () =>
    run("PDF", () =>
      withFallback(
        async () => {
          const { blob, filename } = await exportDoc("pdf", doc());
          downloadBlob(blob, filename);
        },
        async () => {
          if (NATIVE) {
            exportTexLocal(doc());
            const { blob, filename } = await pdfLocal(doc());
            downloadBlob(blob, filename);
            return;
          }
          print();
          return { kind: "info", text: OFFLINE_PDF_HINT };
        },
      ),
    );

  const png = () =>
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

  const preview = () =>
    run("bản xem trước", () =>
      withFallback(
        async () => {
          const { blob } = await exportDoc("pdf", doc());
          onPreview(URL.createObjectURL(blob));
        },
        async () => print(),
      ),
    );

  const pdfToDrive = () =>
    run("PDF lên Drive", async () => {
      try {
        const { blob, filename } = await exportDoc("pdf", doc());
        await uploadBlobToDrive(blob, filename);
      } catch (e) {
        if (isServerUnavailable(e)) {
          return { kind: "error", text: "Cần máy chủ xuất PDF để lưu PDF lên Drive (đang ngoại tuyến?)." };
        }
        throw e;
      }
    });

  return (
    <div className="export-menu" role="group" aria-label="Xuất file">
      <span className="group-label">Xuất:</span>
      <button type="button" disabled={busy !== null} onClick={() => void tex()}>
        LaTeX
      </button>
      <button type="button" disabled={busy !== null} onClick={() => void pdf()}>
        PDF
      </button>
      <button type="button" disabled={busy !== null} onClick={() => void png()}>
        PNG
      </button>
      {NATIVE ? null : (
        <>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void preview()}
            title="Xem trước bản in"
          >
            Xem trước
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("bản in", async () => print())}
            title="In hoặc lưu PDF ngay trên máy, không cần mạng"
          >
            In
          </button>
        </>
      )}
      {signedIn && SERVER_ENABLED ? (
        <button type="button" disabled={busy !== null} onClick={() => void pdfToDrive()}>
          Lưu PDF lên Drive
        </button>
      ) : null}
      {status ? (
        <span className={`status ${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>
          {status.text}
        </span>
      ) : null}
    </div>
  );
}
