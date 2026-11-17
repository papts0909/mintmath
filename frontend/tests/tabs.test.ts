import { beforeEach, describe, expect, it } from "vitest";
import { newDocument } from "../src/core/docFormat";
import { resetDocStore, useDocStore } from "../src/core/docStore";
import {
  _resetTabs,
  activateTab,
  closeTab,
  MAX_TABS,
  openDoc,
  openNewDoc,
  readSavedTabs,
  receiveNewerDoc,
  useTabs,
} from "../src/core/tabs";

const titled = (title: string) => ({ ...newDocument(), title });
const ids = () => useTabs.getState().tabs.map((t) => t.id);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetDocStore();
  _resetTabs();
});

describe("tabs", () => {
  it("opens documents next to the active tab and switches back with content", async () => {
    const first = useDocStore.getState().doc.id;
    const a = titled("A");
    const b = titled("B");
    openDoc(a);
    openDoc(b);
    expect(ids()).toEqual([first, a.id, b.id]);
    expect(useTabs.getState().active).toBe(b.id);
    await activateTab(a.id);
    expect(useDocStore.getState().doc.title).toBe("A");
    // Opening an open document switches to its tab instead of adding one.
    openDoc(b);
    expect(ids()).toHaveLength(3);
    expect(useDocStore.getState().doc.title).toBe("B");
  });

  it("follows the active document's title and remembers the tabs", () => {
    openNewDoc();
    useDocStore.getState().setTitle("Hình học");
    const t = useTabs.getState().tabs.find((x) => x.id === useTabs.getState().active)!;
    expect(t.title).toBe("Hình học");
    expect(readSavedTabs()?.tabs.map((x) => x.title)).toContain("Hình học");
  });

  it("closing the active tab shows a neighbour; closing the last starts fresh", async () => {
    const a = titled("A");
    openDoc(a);
    await closeTab(a.id);
    expect(ids()).toHaveLength(1);
    expect(useDocStore.getState().doc.id).not.toBe(a.id);
    const only = ids()[0];
    await closeTab(only);
    expect(ids()).toHaveLength(1);
    expect(ids()[0]).not.toBe(only);
  });

  it("keeps at most MAX_TABS tabs", () => {
    for (let i = 0; i < MAX_TABS + 3; i++) openDoc(titled(`T${i}`));
    expect(ids()).toHaveLength(MAX_TABS);
    expect(useDocStore.getState().doc.title).toBe(`T${MAX_TABS + 2}`);
  });

  it("takes a newer copy from another window unless there are unsaved edits", () => {
    const here = useDocStore.getState().doc;
    const newer = { ...here, title: "từ cửa sổ khác", updatedAt: new Date(Date.now() + 5000).toISOString() };
    expect(receiveNewerDoc(newer, true)).toBe("kept");
    expect(useDocStore.getState().doc.title).not.toBe("từ cửa sổ khác");
    expect(receiveNewerDoc(newer, false)).toBe("loaded");
    expect(useDocStore.getState().doc.title).toBe("từ cửa sổ khác");
    expect(receiveNewerDoc(newer, false)).toBe("none");
  });
});
