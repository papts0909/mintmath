// Several documents open at once, one tab each. The active tab's document
// lives in the doc store (the editor); the others are kept here with their
// undo history, and every document is also saved in the on-device library.
//
// Open tabs are remembered per browser tab (sessionStorage, survives reloads)
// and as the last layout (localStorage, used when the app starts fresh).
// Other windows of the app are told when a document is saved, so a document
// open in two windows does not silently fall behind (see App).
import { create } from "zustand";
import { newDocument } from "./docFormat";
import { useDocStore } from "./docStore";
import { getDoc, putDoc } from "./library";
import type { Doc } from "./types";

export const TABS_KEY = "mathpad.tabs.v1";
export const MAX_TABS = 20;

export interface TabInfo {
  id: string;
  title: string;
}

interface Parked {
  doc: Doc;
  past: ReturnType<typeof useDocStore.getState>["past"];
  future: ReturnType<typeof useDocStore.getState>["future"];
  focusedLineId: string | null;
}

interface TabsState {
  tabs: TabInfo[];
  active: string;
}

/** Inactive tabs, with their undo history (this window only). */
const parked = new Map<string, Parked>();

const current = () => useDocStore.getState();

export const useTabs = create<TabsState>()(() => {
  const doc = current().doc;
  return { tabs: [{ id: doc.id, title: doc.title }], active: doc.id };
});

// ---------- persistence ----------

function persist(): void {
  const { tabs, active } = useTabs.getState();
  const data = JSON.stringify({ tabs, active });
  for (const s of [sessionStorage, localStorage]) {
    try {
      s.setItem(TABS_KEY, data);
    } catch {
      /* storage unavailable */
    }
  }
}
useTabs.subscribe(persist);

export function readSavedTabs(): TabsState | null {
  for (const s of [sessionStorage, localStorage]) {
    try {
      const raw = s.getItem(TABS_KEY);
      if (!raw) continue;
      const v = JSON.parse(raw) as Partial<TabsState>;
      const tabs = (v.tabs ?? []).filter(
        (t): t is TabInfo => typeof t?.id === "string" && typeof t?.title === "string",
      );
      if (tabs.length && typeof v.active === "string")
        return { tabs: tabs.slice(0, MAX_TABS), active: v.active };
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** At start-up, after the last open document was loaded into the editor:
 *  bring back this window's tabs (or the last layout). */
export async function restoreTabs(): Promise<void> {
  const saved = readSavedTabs();
  if (saved) {
    // Drop tabs whose document is gone (deleted, or storage was cleared).
    const doc = current().doc;
    const exists = await Promise.all(
      saved.tabs.map((t) => (t.id === doc.id ? true : getDoc(t.id).then(Boolean, () => false))),
    );
    saved.tabs = saved.tabs.filter((_, i) => exists[i]);
    if (!saved.tabs.length) return restoreTabsFrom(null);
  }
  return restoreTabsFrom(saved);
}

async function restoreTabsFrom(saved: TabsState | null): Promise<void> {
  const doc = current().doc;
  const single = { tabs: [{ id: doc.id, title: doc.title }], active: doc.id };
  if (!saved) {
    useTabs.setState(single);
    return;
  }
  if (saved.active !== doc.id) {
    // The "last open document" was written by another window: show this
    // window's own active tab instead, if it still exists.
    const own = await getDoc(saved.active).catch(() => null);
    if (own) {
      current().loadDoc(own);
      useTabs.setState({ tabs: saved.tabs, active: own.id });
      return;
    }
  }
  const tabs = saved.tabs.some((t) => t.id === doc.id)
    ? saved.tabs.map((t) => (t.id === doc.id ? { id: doc.id, title: doc.title } : t))
    : [...saved.tabs, { id: doc.id, title: doc.title }];
  useTabs.setState({ tabs, active: doc.id });
}

// ---------- keeping titles current ----------

useDocStore.subscribe((s, prev) => {
  if (s.doc === prev.doc) return;
  const { tabs, active } = useTabs.getState();
  if (s.doc.id !== active) return;
  const t = tabs.find((x) => x.id === active);
  if (t && t.title !== s.doc.title)
    useTabs.setState({ tabs: tabs.map((x) => (x.id === active ? { ...x, title: s.doc.title } : x)) });
});

// ---------- switching ----------

function park(): Doc {
  const s = current();
  parked.set(s.doc.id, {
    doc: s.doc,
    past: s.past,
    future: s.future,
    focusedLineId: s.focusedLineId,
  });
  void putDoc(s.doc).catch(() => false);
  return s.doc;
}

function show(p: Parked): void {
  const s = current();
  s.loadDoc(p.doc);
  useDocStore.setState({
    past: p.past,
    future: p.future,
    focusedLineId: p.focusedLineId ?? current().doc.lines[0].id,
    focusEdge: "end",
    focusNonce: current().focusNonce + 1,
  });
  parked.delete(p.doc.id);
}

async function parkedOrStored(id: string): Promise<Parked | null> {
  const p = parked.get(id);
  if (p) return p;
  const doc = await getDoc(id).catch(() => null);
  return doc ? { doc, past: [], future: [], focusedLineId: null } : null;
}

/** Switch to an open tab. Returns false if its document no longer exists. */
export async function activateTab(id: string): Promise<boolean> {
  const { tabs, active } = useTabs.getState();
  if (id === active) return true;
  const target = await parkedOrStored(id);
  if (!target) {
    useTabs.setState({ tabs: tabs.filter((t) => t.id !== id) });
    return false;
  }
  park();
  show(target);
  useTabs.setState({ active: id });
  return true;
}

/** Open a document: switch to its tab, or add a tab next to the active one. */
export function openDoc(doc: Doc): void {
  const { tabs, active } = useTabs.getState();
  if (doc.id === active) {
    current().loadDoc(doc);
    return;
  }
  park();
  parked.delete(doc.id);
  show({ doc, past: [], future: [], focusedLineId: null });
  if (tabs.some((t) => t.id === doc.id)) {
    useTabs.setState({
      active: doc.id,
      tabs: tabs.map((t) => (t.id === doc.id ? { id: doc.id, title: doc.title } : t)),
    });
    return;
  }
  const at = tabs.findIndex((t) => t.id === active) + 1;
  let next = [...tabs.slice(0, at), { id: doc.id, title: doc.title }, ...tabs.slice(at)];
  // Too many tabs: drop the oldest other tab (its document stays in the library).
  while (next.length > MAX_TABS) {
    const drop = next.find((t) => t.id !== doc.id)!;
    parked.delete(drop.id);
    next = next.filter((t) => t !== drop);
  }
  useTabs.setState({ tabs: next, active: doc.id });
}

export function openNewDoc(): void {
  openDoc(newDocument());
}

/** Close a tab. The document stays in the library. */
export async function closeTab(id: string): Promise<void> {
  const { tabs, active } = useTabs.getState();
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  if (id !== active) {
    parked.delete(id);
    useTabs.setState({ tabs: tabs.filter((t) => t.id !== id) });
    return;
  }
  void putDoc(current().doc).catch(() => false);
  const rest = tabs.filter((t) => t.id !== id);
  // Neighbour to the right, else to the left; a fresh document if none is left.
  for (const t of [...rest.slice(i), ...rest.slice(0, i).reverse()]) {
    const target = await parkedOrStored(t.id);
    if (target) {
      show(target);
      useTabs.setState({ tabs: rest, active: t.id });
      return;
    }
  }
  const doc = newDocument();
  current().loadDoc(doc);
  useTabs.setState({ tabs: [{ id: doc.id, title: doc.title }], active: doc.id });
}

/** A document was deleted from the library: close its tab without saving it back. */
export async function forgetDoc(id: string): Promise<void> {
  const { tabs, active } = useTabs.getState();
  parked.delete(id);
  if (id !== active) {
    useTabs.setState({ tabs: tabs.filter((t) => t.id !== id) });
    return;
  }
  const rest = tabs.filter((t) => t.id !== id);
  for (const t of rest) {
    const target = await parkedOrStored(t.id);
    if (target) {
      show(target);
      useTabs.setState({ tabs: rest, active: t.id });
      return;
    }
  }
  const doc = newDocument();
  current().loadDoc(doc);
  useTabs.setState({ tabs: [{ id: doc.id, title: doc.title }], active: doc.id });
}

/** A newer copy of a document arrived (another window, B2 sync). Returns
 *  "loaded" if the editor now shows it, "kept" if this window has unsaved
 *  edits to it, or "background" if it was open in another tab. */
export function receiveNewerDoc(
  doc: Doc,
  hasUnsavedEdits: boolean,
): "loaded" | "kept" | "background" | "none" {
  const { tabs, active } = useTabs.getState();
  if (doc.id === active) {
    const here = current().doc;
    if (here.updatedAt >= doc.updatedAt) return "none";
    if (hasUnsavedEdits) return "kept";
    const focus = current().focusedLineId;
    current().loadDoc(doc);
    if (focus && doc.lines.some((l) => l.id === focus)) useDocStore.setState({ focusedLineId: focus });
    return "loaded";
  }
  const p = parked.get(doc.id);
  if (p && p.doc.updatedAt < doc.updatedAt) parked.set(doc.id, { ...p, doc, past: [], future: [] });
  if (tabs.some((t) => t.id === doc.id)) {
    useTabs.setState({ tabs: tabs.map((t) => (t.id === doc.id ? { ...t, title: doc.title } : t)) });
    return "background";
  }
  return "none";
}

/** Tests only. */
export function _resetTabs(): void {
  parked.clear();
  const doc = current().doc;
  useTabs.setState({ tabs: [{ id: doc.id, title: doc.title }], active: doc.id });
}
