import { describe, expect, it, vi } from "vitest";
import { ExportError, exportDoc, filenameFromDisposition } from "../src/api/exportClient";
import { newDocument } from "../src/core/docFormat";

const fetchReturning = (res: Response | (() => never)) =>
  vi.fn(async () => (typeof res === "function" ? res() : res)) as unknown as typeof fetch;

describe("exportClient", () => {
  it("parses Content-Disposition", () => {
    expect(
      filenameFromDisposition(`attachment; filename="Bai.pdf"; filename*=UTF-8''B%C3%A0i.pdf`, "x"),
    ).toBe("Bài.pdf");
    expect(filenameFromDisposition(`attachment; filename="a.tex"`, "x")).toBe("a.tex");
    expect(filenameFromDisposition(null, "x.pdf")).toBe("x.pdf");
  });

  it("posts the document and returns the blob", async () => {
    const f = fetchReturning(
      new Response("%PDF", {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="d.pdf"' },
      }),
    );
    const doc = newDocument();
    const r = await exportDoc("pdf", doc, { fetchImpl: f });
    expect(r.filename).toBe("d.pdf");
    expect(await r.blob.text()).toBe("%PDF");
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/export/pdf");
    expect(JSON.parse(init.body)).toEqual(doc);
  });

  it("passes dpi for PNG", async () => {
    const f = fetchReturning(new Response("x", { headers: { "Content-Type": "image/png" } }));
    await exportDoc("png", newDocument(), { fetchImpl: f, dpi: 300 });
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/export/png?dpi=300");
  });

  it("maps a compile error to the line", async () => {
    const f = fetchReturning(
      new Response(JSON.stringify({ lineId: "L2", message: "Undefined control sequence" }), { status: 400 }),
    );
    const err = await exportDoc("pdf", newDocument(), { fetchImpl: f }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExportError);
    expect(err).toMatchObject({ status: 400, lineId: "L2", message: "Undefined control sequence" });
  });

  it("explains timeouts and network errors", async () => {
    const timeout = fetchReturning(new Response("{}", { status: 504 }));
    await expect(exportDoc("pdf", newDocument(), { fetchImpl: timeout })).rejects.toMatchObject({
      status: 504,
      message: expect.stringContaining("quá thời gian"),
    });
    const offline = fetchReturning(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(exportDoc("pdf", newDocument(), { fetchImpl: offline })).rejects.toMatchObject({
      status: 0,
    });
  });
});
