// Document model. Must stay in sync with backend/app/models.py.
export type LineType = "math" | "text";

export interface Line {
  id: string; // nanoid
  type: LineType;
  content: string; // math: LaTeX; text: plain Unicode text
  joinPrev?: boolean; // true = joined line (Shift+Enter), same block as the line above
}

export const DOC_VERSION = 1 as const;

export interface Doc {
  version: typeof DOC_VERSION;
  id: string;
  title: string;
  lines: Line[];
  updatedAt: string; // ISO 8601
}

export const LIMITS = {
  maxLines: 2000,
  maxBytes: 1_000_000,
} as const;
