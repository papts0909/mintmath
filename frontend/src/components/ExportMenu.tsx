import { useState } from "react";
import { downloadBlob, ExportError, exportDoc, type ExportKind } from "../api/exportClient";
import { useDocStore } from "../core/docStore";
import { uploadBlobToDrive, useDriveUi } from "../drive/driveActions";

interface Props {
  onPreview: (url: string) => void;
}

const LABELS: Record<ExportKind, string> = { tex: "LaTeX (.tex)", pdf: "PDF", png: "Ảnh PNG" };

export default function ExportMenu({ onPreview }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const signedIn = useDriveUi((s) => s.signedIn);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setStatus({ kind: "info", text: `Đang xuất ${label}…` });
    useDocStore.getState().setError(null);
    try {
      await fn();
      setStatus(null);
    } catch (e) {
      if (e instanceof ExportError) {
        if (e.lineId) {
          useDocStore.getState().setError({ lineId: e.lineId, message: e.message });
          const idx = useDocStore.getState().doc.lines.findIndex((l) => l.id === e.lineId);
          setStatus({ kind: "error", text: `Lỗi ở dòng ${idx + 1}: ${e.message}` });
          useDocStore.getState().focusLine(e.lineId);
        } else {
          setStatus({ kind: "error", text: e.message });
        }
      } else {
        setStatus({ kind: "error", text: e instanceof Error ? e.message : "Xuất file thất bại" });
      }
    } finally {
      setBusy(null);
    }
  };

  const doExport = (kind: ExportKind) =>
    run(LABELS[kind], async () => {
      const { blob, filename } = await exportDoc(kind, useDocStore.getState().doc);
      downloadBlob(blob, filename);
    });

  const preview = () =>
    run("bản xem trước", async () => {
      const { blob } = await exportDoc("pdf", useDocStore.getState().doc);
      onPreview(URL.createObjectURL(blob));
    });

  const pdfToDrive = () =>
    run("PDF lên Drive", async () => {
      const { blob, filename } = await exportDoc("pdf", useDocStore.getState().doc);
      await uploadBlobToDrive(blob, filename);
    });

  return (
    <div className="export-menu" role="group" aria-label="Xuất file">
      <span className="group-label">Xuất:</span>
      {(Object.keys(LABELS) as ExportKind[]).map((k) => (
        <button key={k} type="button" disabled={busy !== null} onClick={() => void doExport(k)}>
          {k === "tex" ? "LaTeX" : k.toUpperCase()}
        </button>
      ))}
      <button type="button" disabled={busy !== null} onClick={() => void preview()} title="Xem trước bản in">
        Xem trước
      </button>
      {signedIn ? (
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
