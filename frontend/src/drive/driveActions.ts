// Glue between the document store and Google Drive.
import { create } from "zustand";
import { docFileName, serializeDoc } from "../core/docFormat";
import { useDocStore } from "../core/docStore";
import { AuthError, getAccessToken, invalidateToken, onAuthChange, signIn, signOut } from "./auth";
import { googleConfig } from "./config";
import { createDriveApi, DriveError } from "./driveApi";
import { pickFile } from "./picker";

export const driveApi = createDriveApi({ get: () => getAccessToken(), invalidate: invalidateToken });

interface DriveUiState {
  configured: boolean;
  signedIn: boolean;
  account: string | null;
  busy: boolean;
  savedAt: Date | null;
  message: { kind: "info" | "error"; text: string } | null;
  /** Set when the bound file vanished: offer to save as a new file. */
  offerSaveAsNew: boolean;
}

export const useDriveUi = create<DriveUiState>()(() => ({
  configured: googleConfig() !== null,
  signedIn: false,
  account: null,
  busy: false,
  savedAt: null,
  message: null,
  offerSaveAsNew: false,
}));

onAuthChange((signedIn) => {
  useDriveUi.setState({ signedIn, ...(signedIn ? {} : { account: null }) });
});

export function describeError(e: unknown): string {
  if (e instanceof DriveError || e instanceof AuthError) return e.message;
  if (e instanceof Error) return e.message;
  return "Đã xảy ra lỗi không xác định.";
}

async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
  useDriveUi.setState({ busy: true, message: null });
  try {
    return await fn();
  } catch (e) {
    const notFound = e instanceof DriveError && e.kind === "not_found";
    useDriveUi.setState({ message: { kind: "error", text: describeError(e) }, offerSaveAsNew: notFound });
    return undefined;
  } finally {
    useDriveUi.setState({ busy: false });
  }
}

export async function driveSignIn(): Promise<void> {
  await run(async () => {
    await signIn();
    const account = await driveApi.getAccountName().catch(() => "Google");
    useDriveUi.setState({ account, signedIn: true });
  });
}

export function driveSignOut(): void {
  signOut();
  useDriveUi.setState({ signedIn: false, account: null, savedAt: null });
}

/** Save to Drive: overwrite the bound file, or create a new one (always new when `copy`). */
export async function saveToDrive(opts: { copy?: boolean } = {}): Promise<boolean> {
  const result = await run(async () => {
    const st = useDocStore.getState();
    const doc = { ...st.doc, updatedAt: new Date().toISOString() };
    const content = serializeDoc(doc);
    const name = docFileName(doc.title);
    const file =
      st.driveFileId && !opts.copy
        ? await driveApi.updateFile(st.driveFileId, content, name)
        : await driveApi.createFile(name, content);
    useDocStore.getState().setDriveFileId(file.id);
    useDocStore.getState().markDriveSaved();
    useDriveUi.setState({
      savedAt: new Date(),
      offerSaveAsNew: false,
      message: { kind: "info", text: opts.copy ? "Đã lưu bản sao lên Drive." : "Đã lưu lên Drive." },
    });
    return true;
  });
  return result === true;
}

/** Bound file was deleted on Drive: forget it and save as a new file. */
export async function saveAsNewAfterMissing(): Promise<boolean> {
  useDocStore.getState().setDriveFileId(null);
  return saveToDrive();
}

export async function openFromDrive(confirmDiscard: () => boolean): Promise<boolean> {
  if (useDocStore.getState().dirty && !confirmDiscard()) return false;
  const result = await run(async () => {
    const fileId = await pickFile();
    if (!fileId) return false;
    const doc = await driveApi.downloadFile(fileId);
    useDocStore.getState().loadDoc(doc, { driveFileId: fileId });
    useDriveUi.setState({ savedAt: null, message: { kind: "info", text: "Đã mở tài liệu từ Drive." } });
    return true;
  });
  return result === true;
}

export async function uploadBlobToDrive(blob: Blob, name: string): Promise<boolean> {
  const result = await run(async () => {
    await driveApi.createFile(name, blob, blob.type || "application/octet-stream");
    useDriveUi.setState({ message: { kind: "info", text: `Đã lưu ${name} lên Drive.` } });
    return true;
  });
  return result === true;
}
