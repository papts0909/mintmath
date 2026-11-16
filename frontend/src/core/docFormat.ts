import { DOC_VERSION, type Doc, type Line, type LineType } from "./types";
import { newId } from "./id";

export const FILE_EXTENSION = ".mathpad.json";
export const FILE_MIME = "application/json";

export class DocFormatError extends Error {}

export function emptyLine(type: LineType = "math"): Line {
  return { id: newId(), type, content: "" };
}

export function newDocument(): Doc {
  return {
    version: DOC_VERSION,
    id: newId(),
    title: "",
    lines: [emptyLine("math")],
    updatedAt: new Date().toISOString(),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validate an unknown value (parsed JSON) and return a Doc, or throw DocFormatError. */
export function parseDoc(value: unknown): Doc {
  if (!isRecord(value)) throw new DocFormatError("Tệp không phải tài liệu MathPad.");
  const version = value.version;
  if (typeof version !== "number") throw new DocFormatError("Tệp thiếu số phiên bản.");
  if (version > DOC_VERSION) {
    throw new DocFormatError(
      `Tệp được tạo bởi phiên bản MathPad mới hơn (định dạng v${version}); ` +
        `ứng dụng này chỉ hỗ trợ tới v${DOC_VERSION}. Hãy cập nhật ứng dụng.`,
    );
  }
  if (version !== DOC_VERSION) throw new DocFormatError(`Phiên bản định dạng không hợp lệ: ${version}`);
  if (!Array.isArray(value.lines)) throw new DocFormatError("Tệp thiếu danh sách dòng.");
  const seen = new Set<string>();
  const lines: Line[] = value.lines.map((raw, i) => {
    if (!isRecord(raw)) throw new DocFormatError(`Dòng ${i + 1} không hợp lệ.`);
    const type = raw.type;
    if (type !== "math" && type !== "text") throw new DocFormatError(`Dòng ${i + 1}: loại không hợp lệ.`);
    if (typeof raw.content !== "string") throw new DocFormatError(`Dòng ${i + 1}: thiếu nội dung.`);
    let id = typeof raw.id === "string" && raw.id ? raw.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const line: Line = { id, type, content: raw.content };
    if (raw.joinPrev === true) line.joinPrev = true;
    return line;
  });
  return {
    version: DOC_VERSION,
    id: typeof value.id === "string" && value.id ? value.id : newId(),
    title: typeof value.title === "string" ? value.title : "",
    lines: lines.length ? lines : [emptyLine()],
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  };
}

export function parseDocText(text: string): Doc {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new DocFormatError("Tệp không phải JSON hợp lệ.");
  }
  return parseDoc(data);
}

export function serializeDoc(doc: Doc): string {
  return JSON.stringify(doc, null, 2);
}

export function docFileName(title: string): string {
  const stem =
    title
      .normalize("NFC")
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 80) || "mathpad";
  return stem + FILE_EXTENSION;
}

export function isDocEmpty(doc: Doc): boolean {
  return !doc.title.trim() && doc.lines.every((l) => !l.content.trim());
}
