// A fake Google Identity Services + Picker + Drive v3 for E2E tests.
import type { Page, Route } from "@playwright/test";

export interface FakeDrive {
  files: Map<string, { name: string; mimeType: string; content: string }>;
  tokensIssued: number;
  /** Make the next N Drive calls answer 401 (expired token). */
  expireNext: (n: number) => void;
  /** Which file the Picker returns next (null = cancel). */
  pickNext: (id: string | null) => void;
  /** Make the next token request fail with access_denied. */
  denyNext: () => void;
}

const GIS = `
window.google = window.google || {};
window.google.accounts = { oauth2: {
  initTokenClient(cfg) {
    return { requestAccessToken() {
      fetch("/__fake/token").then(r => r.json()).then(t => setTimeout(() => cfg.callback(t), 0));
    } };
  },
  revoke(token, done) { done && done(); },
} };
`;

const GAPI = `
window.gapi = { load(lib, cb) { setTimeout(cb.callback, 0); } };
window.google = window.google || {};
window.google.picker = {
  ViewId: { DOCS: "docs" },
  DocsViewMode: { LIST: "list" },
  Action: { PICKED: "picked", CANCEL: "cancel" },
  DocsView: class { setMimeTypes() { return this; } setQuery() { return this; } setMode() { return this; } },
  PickerBuilder: class {
    addView() { return this; } setOAuthToken() { return this; } setDeveloperKey() { return this; }
    setAppId() { return this; } setTitle() { return this; } setLocale() { return this; }
    setCallback(cb) { this.cb = cb; return this; }
    build() { const cb = this.cb; return { setVisible() {
      fetch("/__fake/pick").then(r => r.json()).then(p =>
        cb(p.id ? { action: "picked", docs: [{ id: p.id }] } : { action: "cancel" }));
    } }; }
  },
};
`;

function parseMultipart(body: string): { meta: Record<string, string>; content: string } {
  const boundary = body.slice(2, body.indexOf("\r\n"));
  const parts = body.split(`--${boundary}`).filter((p) => p.trim() && p.trim() !== "--");
  const strip = (p: string) => p.slice(p.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, "");
  const meta = JSON.parse(Buffer.from(strip(parts[0]), "latin1").toString("utf-8")) as Record<string, string>;
  return { meta, content: strip(parts[1]) };
}

export async function installFakeGoogle(page: Page): Promise<FakeDrive> {
  let expire = 0;
  let pick: string | null = null;
  let deny = false;
  let nextId = 1;
  const state: FakeDrive = {
    files: new Map(),
    tokensIssued: 0,
    expireNext: (n) => (expire = n),
    pickNext: (id) => (pick = id),
    denyNext: () => (deny = true),
  };

  await page.route("https://accounts.google.com/gsi/client", (r) =>
    r.fulfill({ contentType: "text/javascript", body: GIS }),
  );
  await page.route("https://apis.google.com/js/api.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: GAPI }),
  );
  await page.route("**/__fake/token", (r) => {
    if (deny) {
      deny = false;
      return r.fulfill({ json: { error: "access_denied" } });
    }
    state.tokensIssued++;
    return r.fulfill({ json: { access_token: `tok${state.tokensIssued}`, expires_in: 3600 } });
  });
  await page.route("**/__fake/pick", (r) => r.fulfill({ json: { id: pick } }));

  const handle = async (route: Route) => {
    const req = route.request();
    if (expire > 0) {
      expire--;
      return route.fulfill({ status: 401, json: { error: { code: 401, message: "expired" } } });
    }
    const url = new URL(req.url());
    const m = /\/files(?:\/([^/?]+))?$/.exec(url.pathname);
    if (url.pathname.endsWith("/about")) {
      return route.fulfill({ json: { user: { displayName: "Người thử", emailAddress: "t@example.com" } } });
    }
    if (!m) return route.fulfill({ status: 400, json: { error: { message: "bad" } } });
    const id = m[1] ? decodeURIComponent(m[1]) : null;
    const method = req.method();
    if (method === "POST" && !id) {
      const { meta, content } = parseMultipart(req.postDataBuffer()!.toString("latin1"));
      const newId = `file${nextId++}`;
      state.files.set(newId, { name: meta.name, mimeType: meta.mimeType, content });
      return route.fulfill({ json: { id: newId, name: meta.name } });
    }
    if (!id || !state.files.has(id)) {
      return route.fulfill({ status: 404, json: { error: { code: 404, message: "File not found" } } });
    }
    const file = state.files.get(id)!;
    if (method === "PATCH") {
      const { meta, content } = parseMultipart(req.postDataBuffer()!.toString("latin1"));
      state.files.set(id, { ...file, name: meta.name ?? file.name, content });
      return route.fulfill({ json: { id, name: meta.name ?? file.name } });
    }
    if (method === "GET" && url.searchParams.get("alt") === "media") {
      return route.fulfill({ body: Buffer.from(file.content, "latin1"), contentType: file.mimeType });
    }
    return route.fulfill({ status: 405, json: {} });
  };
  await page.route("https://www.googleapis.com/**", handle);
  return state;
}

/** Decode a stored file's content (stored as latin1 bytes of UTF-8). */
export function fileText(content: string): string {
  return Buffer.from(content, "latin1").toString("utf-8");
}
