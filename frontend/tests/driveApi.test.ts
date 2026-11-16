import { describe, expect, it, vi } from "vitest";
import { newDocument, serializeDoc } from "../src/core/docFormat";
import { createDriveApi, DriveError } from "../src/drive/driveApi";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function setup(handlers: Handler[]) {
  let token = "t1";
  const tokens = {
    get: vi.fn(async () => token),
    invalidate: vi.fn(() => {
      token = "t2";
    }),
  };
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const i = calls.length;
    calls.push({ url: String(url), init: init ?? {} });
    const h = handlers[Math.min(i, handlers.length - 1)];
    return h(String(url), init ?? {});
  }) as unknown as typeof fetch;
  return { api: createDriveApi(tokens, fetchImpl), tokens, calls };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const driveError = (status: number, reason = "") =>
  json({ error: { code: status, message: "msg", errors: reason ? [{ reason }] : [] } }, status);

const auth = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

describe("driveApi", () => {
  it("createFile uploads multipart with the bearer token", async () => {
    const { api, calls } = setup([() => json({ id: "f1", name: "a.mathpad.json" })]);
    const file = await api.createFile("a.mathpad.json", '{"x":1}');
    expect(file.id).toBe("f1");
    expect(calls[0].url).toContain("/upload/drive/v3/files?uploadType=multipart");
    expect(calls[0].init.method).toBe("POST");
    expect(auth(calls[0].init)).toBe("Bearer t1");
    const ct = (calls[0].init.headers as Record<string, string>)["Content-Type"];
    expect(ct).toMatch(/^multipart\/related; boundary=/);
    const body = await (calls[0].init.body as Blob).text();
    expect(body).toContain('"name":"a.mathpad.json"');
    expect(body).toContain('"mimeType":"application/json"');
    expect(body).toContain('{"x":1}');
  });

  it("createFile can upload a PDF blob", async () => {
    const { api, calls } = setup([() => json({ id: "p1", name: "a.pdf" })]);
    await api.createFile("a.pdf", new Blob(["%PDF-1.5"], { type: "application/pdf" }), "application/pdf");
    const body = await (calls[0].init.body as Blob).text();
    expect(body).toContain("Content-Type: application/pdf");
    expect(body).toContain("%PDF-1.5");
  });

  it("updateFile patches the existing file", async () => {
    const { api, calls } = setup([() => json({ id: "f1", name: "n" })]);
    await api.updateFile("f1", "{}", "n.mathpad.json");
    expect(calls[0].url).toContain("/upload/drive/v3/files/f1?uploadType=multipart");
    expect(calls[0].init.method).toBe("PATCH");
  });

  it("downloadFile parses and validates the document", async () => {
    const doc = newDocument();
    doc.title = "T";
    const { api, calls } = setup([() => new Response(serializeDoc(doc))]);
    expect(await api.downloadFile("f1")).toEqual(doc);
    expect(calls[0].url).toContain("/drive/v3/files/f1?alt=media");
  });

  it("downloadFile rejects a newer format", async () => {
    const { api } = setup([() => new Response(JSON.stringify({ version: 5, lines: [] }))]);
    await expect(api.downloadFile("f1")).rejects.toMatchObject({ kind: "format" });
  });

  it.each(["createFile", "updateFile", "downloadFile"] as const)(
    "%s refreshes the token once on 401",
    async (fn) => {
      const doc = newDocument();
      const ok = fn === "downloadFile" ? () => new Response(serializeDoc(doc)) : () => json({ id: "f" });
      const { api, tokens, calls } = setup([() => driveError(401), ok]);
      if (fn === "createFile") await api.createFile("a", "{}");
      else if (fn === "updateFile") await api.updateFile("f", "{}");
      else await api.downloadFile("f");
      expect(tokens.invalidate).toHaveBeenCalledTimes(1);
      expect(calls).toHaveLength(2);
      expect(auth(calls[1].init)).toBe("Bearer t2");
    },
  );

  it("gives up after a second 401", async () => {
    const { api } = setup([() => driveError(401)]);
    await expect(api.updateFile("f", "{}")).rejects.toMatchObject({ kind: "auth" });
  });

  it.each(["updateFile", "downloadFile"] as const)("%s reports 404 as not_found", async (fn) => {
    const { api } = setup([() => driveError(404)]);
    const p = fn === "updateFile" ? api.updateFile("gone", "{}") : api.downloadFile("gone");
    await expect(p).rejects.toBeInstanceOf(DriveError);
    await expect(p).rejects.toMatchObject({ kind: "not_found", status: 404 });
  });

  it("reports a full Drive", async () => {
    const { api } = setup([() => driveError(403, "storageQuotaExceeded")]);
    await expect(api.createFile("a", "{}")).rejects.toMatchObject({ kind: "quota" });
  });

  it("reports other 403s as denied", async () => {
    const { api } = setup([() => driveError(403, "forbidden")]);
    await expect(api.createFile("a", "{}")).rejects.toMatchObject({ kind: "denied" });
  });

  it("reports network failures", async () => {
    const { api } = setup([
      () => {
        throw new TypeError("Failed to fetch");
      },
    ]);
    await expect(api.downloadFile("f")).rejects.toMatchObject({ kind: "network" });
  });

  it("reads the account name", async () => {
    const { api } = setup([() => json({ user: { displayName: "An", emailAddress: "a@x" } })]);
    expect(await api.getAccountName()).toBe("An");
  });
});
