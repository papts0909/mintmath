import { create } from "zustand";
import { emptyLine, newDocument } from "./docFormat";
import { newId } from "./id";
import type { Doc, Line, LineType } from "./types";

export const HISTORY_LIMIT = 100;

export type FocusEdge = "start" | "end";

export interface LineError {
  lineId: string | null;
  message: string;
}

interface Snapshot {
  lines: Line[];
  focusedLineId: string | null;
}

export interface DocState {
  doc: Doc;
  focusedLineId: string | null;
  /** Where the caret should land when focus moves; bumps `focusNonce`. */
  focusEdge: FocusEdge;
  focusNonce: number;
  selection: string[];
  error: LineError | null;
  /** Google Drive file this doc is bound to (Phase 4). */
  driveFileId: string | null;
  /** Unsaved changes relative to Drive. */
  dirty: boolean;
  past: Snapshot[];
  future: Snapshot[];
  /** True when the most recent change was a structural (line-level) one. */
  lastChangeStructural: boolean;

  insertLineAfter: (
    id: string | null,
    type: LineType,
    opts?: { joinPrev?: boolean; content?: string },
  ) => string;
  insertLinesAfter: (id: string | null, lines: Omit<Line, "id">[]) => string[];
  updateLine: (id: string, content: string) => void;
  deleteLine: (id: string) => void;
  deleteLines: (ids: string[]) => void;
  duplicateLine: (id: string) => string | null;
  toggleType: (id: string) => void;
  moveLine: (id: string, toIndex: number) => void;
  setJoinPrev: (id: string, joinPrev: boolean) => void;
  setTitle: (title: string) => void;
  loadDoc: (doc: Doc, opts?: { driveFileId?: string | null }) => void;
  newDoc: () => void;
  focusLine: (id: string | null, edge?: FocusEdge) => void;
  focusRelative: (id: string, delta: number, edge?: FocusEdge) => boolean;
  setSelection: (ids: string[]) => void;
  setError: (error: LineError | null) => void;
  setDriveFileId: (id: string | null) => void;
  markDriveSaved: () => void;
  undo: () => boolean;
  redo: () => boolean;
}

const touch = (doc: Doc, lines: Line[]): Doc => ({
  ...doc,
  lines,
  updatedAt: new Date().toISOString(),
});

function indexOf(lines: Line[], id: string | null): number {
  return id === null ? -1 : lines.findIndex((l) => l.id === id);
}

/** Restore a snapshot's structure while keeping the newest text of surviving lines. */
function restore(snapshot: Line[], current: Line[]): Line[] {
  const now = new Map(current.map((l) => [l.id, l]));
  return snapshot.map((l) => {
    const cur = now.get(l.id);
    return cur ? { ...l, content: cur.content } : { ...l };
  });
}

const initialState = () => ({
  doc: newDocument(),
  focusedLineId: null,
  focusEdge: "end" as FocusEdge,
  focusNonce: 0,
  selection: [],
  error: null,
  driveFileId: null,
  dirty: false,
  past: [],
  future: [],
  lastChangeStructural: false,
});

export const useDocStore = create<DocState>()((set, get) => {
  /** Apply a structural change, recording history. */
  const structural = (lines: Line[], extra: Partial<DocState> = {}): void => {
    const s = get();
    const past = [...s.past, { lines: s.doc.lines, focusedLineId: s.focusedLineId }];
    if (past.length > HISTORY_LIMIT) past.shift();
    set({
      doc: touch(s.doc, lines.length ? lines : [emptyLine()]),
      past,
      future: [],
      dirty: true,
      lastChangeStructural: true,
      ...extra,
    });
  };

  return {
    ...initialState(),

    insertLineAfter: (id, type, opts = {}) => {
      const { lines } = get().doc;
      const line: Line = { id: newId(), type, content: opts.content ?? "" };
      if (opts.joinPrev) line.joinPrev = true;
      const idx = indexOf(lines, id);
      const next = [...lines.slice(0, idx + 1), line, ...lines.slice(idx + 1)];
      structural(next, {
        focusedLineId: line.id,
        focusEdge: "start",
        focusNonce: get().focusNonce + 1,
      });
      return line.id;
    },

    insertLinesAfter: (id, newLines) => {
      if (!newLines.length) return [];
      const { lines } = get().doc;
      const made: Line[] = newLines.map((l) => ({ ...l, id: newId() }));
      const idx = indexOf(lines, id);
      const next = [...lines.slice(0, idx + 1), ...made, ...lines.slice(idx + 1)];
      const last = made[made.length - 1];
      structural(next, {
        focusedLineId: last.id,
        focusEdge: "end",
        focusNonce: get().focusNonce + 1,
      });
      return made.map((l) => l.id);
    },

    updateLine: (id, content) => {
      const s = get();
      const idx = indexOf(s.doc.lines, id);
      if (idx < 0 || s.doc.lines[idx].content === content) return;
      const lines = s.doc.lines.slice();
      lines[idx] = { ...lines[idx], content };
      set({
        doc: touch(s.doc, lines),
        dirty: true,
        lastChangeStructural: false,
        error: s.error?.lineId === id ? null : s.error,
      });
    },

    deleteLine: (id) => {
      const { lines } = get().doc;
      const idx = indexOf(lines, id);
      if (idx < 0) return;
      const next = lines.filter((l) => l.id !== id);
      if (next.length && idx === 0 && next[0].joinPrev) {
        next[0] = { ...next[0] };
        delete next[0].joinPrev;
      }
      const focus = next.length ? next[Math.max(0, idx - 1)].id : null;
      structural(next, {
        focusedLineId: focus,
        focusEdge: "end",
        focusNonce: get().focusNonce + 1,
        selection: get().selection.filter((s) => s !== id),
      });
      if (!next.length) {
        // structural() inserted a fresh empty line; focus it.
        set({ focusedLineId: get().doc.lines[0].id });
      }
    },

    deleteLines: (ids) => {
      const drop = new Set(ids);
      const { lines } = get().doc;
      const firstIdx = lines.findIndex((l) => drop.has(l.id));
      if (firstIdx < 0) return;
      const next = lines.filter((l) => !drop.has(l.id));
      structural(next, {
        selection: [],
        focusedLineId: next.length ? next[Math.max(0, Math.min(firstIdx, next.length) - 1)].id : null,
        focusEdge: "end",
        focusNonce: get().focusNonce + 1,
      });
      if (!next.length) set({ focusedLineId: get().doc.lines[0].id });
    },

    duplicateLine: (id) => {
      const { lines } = get().doc;
      const idx = indexOf(lines, id);
      if (idx < 0) return null;
      const copy: Line = { ...lines[idx], id: newId() };
      const next = [...lines.slice(0, idx + 1), copy, ...lines.slice(idx + 1)];
      structural(next, {
        focusedLineId: copy.id,
        focusEdge: "end",
        focusNonce: get().focusNonce + 1,
      });
      return copy.id;
    },

    toggleType: (id) => {
      const { lines } = get().doc;
      const idx = indexOf(lines, id);
      if (idx < 0) return;
      const next = lines.slice();
      const cur = next[idx];
      next[idx] = { ...cur, type: cur.type === "math" ? "text" : "math" };
      structural(next, {
        focusedLineId: id,
        focusEdge: "end",
        focusNonce: get().focusNonce + 1,
      });
    },

    moveLine: (id, toIndex) => {
      const { lines } = get().doc;
      const idx = indexOf(lines, id);
      if (idx < 0) return;
      const target = Math.max(0, Math.min(lines.length - 1, toIndex));
      if (target === idx) return;
      const next = lines.slice();
      const [line] = next.splice(idx, 1);
      next.splice(target, 0, line);
      if (next[0].joinPrev) {
        next[0] = { ...next[0] };
        delete next[0].joinPrev;
      }
      structural(next, { focusedLineId: id, focusNonce: get().focusNonce + 1 });
    },

    setJoinPrev: (id, joinPrev) => {
      const { lines } = get().doc;
      const idx = indexOf(lines, id);
      if (idx < 0 || (idx === 0 && joinPrev)) return;
      if (Boolean(lines[idx].joinPrev) === joinPrev) return;
      const next = lines.slice();
      const line = { ...next[idx] };
      if (joinPrev) line.joinPrev = true;
      else delete line.joinPrev;
      next[idx] = line;
      structural(next);
    },

    setTitle: (title) => {
      const s = get();
      if (s.doc.title === title) return;
      set({ doc: { ...s.doc, title, updatedAt: new Date().toISOString() }, dirty: true });
    },

    loadDoc: (doc, opts = {}) => {
      set({
        ...initialState(),
        doc: doc.lines.length ? doc : { ...doc, lines: [emptyLine()] },
        driveFileId: opts.driveFileId ?? null,
        focusNonce: get().focusNonce + 1,
      });
    },

    newDoc: () => {
      set({ ...initialState(), focusNonce: get().focusNonce + 1 });
      set({ focusedLineId: get().doc.lines[0].id, focusEdge: "start" });
    },

    focusLine: (id, edge = "end") => {
      set({ focusedLineId: id, focusEdge: edge, focusNonce: get().focusNonce + 1 });
    },

    focusRelative: (id, delta, edge) => {
      const { lines } = get().doc;
      const idx = indexOf(lines, id);
      const target = lines[idx + delta];
      if (idx < 0 || !target) return false;
      get().focusLine(target.id, edge ?? (delta < 0 ? "end" : "start"));
      return true;
    },

    setSelection: (ids) => set({ selection: ids }),
    setError: (error) => set({ error }),
    setDriveFileId: (driveFileId) => set({ driveFileId }),
    markDriveSaved: () => set({ dirty: false }),

    undo: () => {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return false;
      set({
        doc: touch(s.doc, restore(prev.lines, s.doc.lines)),
        past: s.past.slice(0, -1),
        future: [...s.future, { lines: s.doc.lines, focusedLineId: s.focusedLineId }],
        focusedLineId: prev.focusedLineId,
        focusNonce: s.focusNonce + 1,
        dirty: true,
        lastChangeStructural: s.past.length > 1,
      });
      return true;
    },

    redo: () => {
      const s = get();
      const next = s.future[s.future.length - 1];
      if (!next) return false;
      set({
        doc: touch(s.doc, restore(next.lines, s.doc.lines)),
        future: s.future.slice(0, -1),
        past: [...s.past, { lines: s.doc.lines, focusedLineId: s.focusedLineId }],
        focusedLineId: next.focusedLineId,
        focusNonce: s.focusNonce + 1,
        dirty: true,
        lastChangeStructural: true,
      });
      return true;
    },
  };
});

export function resetDocStore(): void {
  useDocStore.setState(initialState());
}
