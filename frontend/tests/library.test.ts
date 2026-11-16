import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { newDocument } from "../src/core/docFormat";
import {
  _resetLibraryConnection,
  deleteDoc,
  exportBackup,
  getDoc,
  importBackup,
  listDocs,
  previewOf,
  putDoc,
  searchEntries,
} from "../src/core/library";
import type { Doc } from "../src/core/types";

function doc(title: string, content: string, updatedAt: string): Doc {
  const d = newDocument();
  d.title = title;
  d.lines = [{ id: "l1", type: "math", content }];
  d.updatedAt = updatedAt;
  return d;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetLibraryConnection();
});

describe("library", () => {
  it("stores, lists newest first, reads and deletes", async () => {
    const a = doc("Bài A", "x^2", "2026-01-01T00:00:00Z");
    const b = doc("Bài B", "\\frac{1}{2}", "2026-02-01T00:00:00Z");
    await putDoc(a);
    await putDoc(b);
    const list = await listDocs();
    expect(list.map((e) => e.title)).toEqual(["Bài B", "Bài A"]);
    expect(await getDoc(a.id)).toEqual(a);
    await deleteDoc(a.id);
    expect((await listDocs()).map((e) => e.id)).toEqual([b.id]);
    expect(await getDoc(a.id)).toBeNull();
  });

  it("replaces a document with the same id", async () => {
    const a = doc("v1", "x", "2026-01-01T00:00:00Z");
    await putDoc(a);
    await putDoc({ ...a, title: "v2", updatedAt: "2026-01-02T00:00:00Z" });
    const list = await listDocs();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("v2");
  });

  it("does not store empty documents", async () => {
    expect(await putDoc(newDocument())).toBe(false);
    expect(await listDocs()).toEqual([]);
  });

  it("searches titles and content, Vietnamese case-insensitive", async () => {
    await putDoc(doc("Hệ phương trình", "x+y=1", "2026-01-01T00:00:00Z"));
    await putDoc(doc("Tích phân", "\\int_0^1 x", "2026-01-02T00:00:00Z"));
    const all = await listDocs();
    expect(searchEntries(all, "HỆ").map((e) => e.title)).toEqual(["Hệ phương trình"]);
    expect(searchEntries(all, "\\int").map((e) => e.title)).toEqual(["Tích phân"]);
    expect(searchEntries(all, "")).toHaveLength(2);
  });

  it("backs up and merges a backup", async () => {
    const a = doc("A", "1", "2026-01-01T00:00:00Z");
    await putDoc(a);
    const backup = await exportBackup();
    expect(backup.docs).toHaveLength(1);

    globalThis.indexedDB = new IDBFactory();
    _resetLibraryConnection();
    const newer = { ...a, title: "A mới", updatedAt: "2026-03-01T00:00:00Z" };
    await putDoc(newer);
    const extra = doc("B", "2", "2026-01-05T00:00:00Z");
    const result = await importBackup({ ...backup, docs: [...backup.docs, extra, { bad: true }] });
    expect(result).toEqual({ added: 1, updated: 0, skipped: 2 });
    expect((await getDoc(a.id))?.title).toBe("A mới"); // local copy is newer: kept
  });

  it("rejects files that are not backups", async () => {
    await expect(importBackup({ version: 1, lines: [] })).rejects.toThrow("bản sao lưu");
  });

  it("builds a readable preview", () => {
    expect(previewOf(doc("", "\\text{Xét }x\\in\\mathbb{R}", ""))).toBe("Xét x R");
    expect(previewOf(newDocument())).toBe("");
  });
});
