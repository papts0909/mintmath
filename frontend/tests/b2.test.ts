import { describe, expect, it, vi } from "vitest";
import {
  B2Error,
  createB2Client,
  normalizePrefix,
  parseEndpoint,
  validateConfig,
  type B2Config,
} from "../src/cloud/b2";
import {
  displayName,
  docIdFromKey,
  isDocKey,
  docKey,
  planSync,
  slugTitle,
  type SyncState,
} from "../src/cloud/b2Sync";

const cfg: B2Config = {
  keyId: "004abc0000000000000000001",
  appKey: "K004secretsecretsecretsecret",
  bucket: "my-math-bucket",
  endpoint: "s3.us-west-004.backblazeb2.com",
  prefix: "mintmath/",
};

const xml = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "application/xml", ...headers } });

function mockFetch(responses: (() => Response)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return responses[Math.min(calls.length - 1, responses.length - 1)]();
  });
  return { f, calls };
}

describe("config", () => {
  it("parses endpoints", () => {
    expect(parseEndpoint("s3.us-west-004.backblazeb2.com")).toEqual({
      host: "s3.us-west-004.backblazeb2.com",
      region: "us-west-004",
    });
    expect(parseEndpoint(" https://S3.eu-central-003.backblazeb2.com/ ")?.region).toBe("eu-central-003");
    expect(parseEndpoint("s3.amazonaws.com")).toBeNull();
    expect(parseEndpoint("")).toBeNull();
  });

  it("normalizes the folder", () => {
    expect(normalizePrefix("/mintmath")).toBe("mintmath/");
    expect(normalizePrefix("a/b/")).toBe("a/b/");
    expect(normalizePrefix("  ")).toBe("");
  });

  it("validates the form", () => {
    expect(validateConfig(cfg)).toBeNull();
    expect(validateConfig({ ...cfg, keyId: "" })).toMatch(/keyID/);
    expect(validateConfig({ ...cfg, appKey: " " })).toMatch(/applicationKey/);
    expect(validateConfig({ ...cfg, bucket: "a" })).toMatch(/bucket/);
    expect(validateConfig({ ...cfg, endpoint: "example.com" })).toMatch(/Endpoint/);
  });
});

describe("client", () => {
  it("signs requests with SigV4 for the bucket's region", async () => {
    const { f, calls } = mockFetch([() => xml("<ListBucketResult></ListBucketResult>")]);
    await createB2Client(cfg, f).test();
    const { url, init } = calls[0];
    expect(url).toContain("https://s3.us-west-004.backblazeb2.com/my-math-bucket?");
    expect(url).toContain("list-type=2");
    const h = init.headers as Record<string, string>;
    expect(h.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=004abc0000000000000000001\/\d{8}\/us-west-004\/s3\/aws4_request/,
    );
    expect(h["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it("lists every page", async () => {
    const page1 = `<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>T2</NextContinuationToken>
      <Contents><Key>mintmath/a__x1.mintmath.json</Key><Size>120</Size><LastModified>2026-01-01T00:00:00.000Z</LastModified><ETag>"e1"</ETag></Contents>
    </ListBucketResult>`;
    const page2 = `<ListBucketResult><IsTruncated>false</IsTruncated>
      <Contents><Key>mintmath/b.tex</Key><Size>9</Size><LastModified>2026-01-02T00:00:00.000Z</LastModified><ETag>"e2"</ETag></Contents>
    </ListBucketResult>`;
    const { f, calls } = mockFetch([() => xml(page1), () => xml(page2)]);
    const list = await createB2Client(cfg, f).list();
    expect(list).toEqual([
      {
        key: "mintmath/a__x1.mintmath.json",
        size: 120,
        lastModified: "2026-01-01T00:00:00.000Z",
        etag: "e1",
      },
      { key: "mintmath/b.tex", size: 9, lastModified: "2026-01-02T00:00:00.000Z", etag: "e2" },
    ]);
    expect(calls[1].url).toContain("continuation-token=T2");
    expect(calls[0].url).toContain("prefix=mintmath%2F");
  });

  it("puts, gets and deletes objects with encoded keys", async () => {
    const { f, calls } = mockFetch([
      () => new Response("", { status: 200, headers: { etag: '"abc"' } }),
      () => new Response("hello"),
      () => new Response(null, { status: 204 }),
    ]);
    const c = createB2Client(cfg, f);
    expect(await c.put("mintmath/Bài 1.tex", "x", "text/x-tex")).toBe("abc");
    expect(calls[0].init.method).toBe("PUT");
    expect(calls[0].url).toBe(
      "https://s3.us-west-004.backblazeb2.com/my-math-bucket/mintmath/B%C3%A0i%201.tex",
    );
    expect((calls[0].init.headers as Record<string, string>)["content-type"]).toBe("text/x-tex");
    expect(await c.getText("mintmath/a.tex")).toBe("hello");
    await c.remove("mintmath/a.tex");
    expect(calls[2].init.method).toBe("DELETE");
  });

  it.each([
    [403, "InvalidAccessKeyId", "auth"],
    [403, "SignatureDoesNotMatch", "auth"],
    [401, "", "auth"],
    [404, "NoSuchBucket", "bucket"],
    [404, "NoSuchKey", "not_found"],
    [500, "InternalError", "other"],
  ])("maps HTTP %i %s to %s", async (status, code, kind) => {
    const { f } = mockFetch([() => xml(`<Error><Code>${code}</Code><Message>m</Message></Error>`, status)]);
    await expect(createB2Client(cfg, f).test()).rejects.toMatchObject({ kind });
  });

  it("reports network failures (offline, or CORS in a browser)", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await createB2Client(cfg, f)
      .test()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(B2Error);
    expect(err).toMatchObject({ kind: "network" });
  });
});

describe("keys", () => {
  it("slugs Vietnamese titles", () => {
    expect(slugTitle("Giải và biện luận hệ phương trình")).toBe("Giai-va-bien-luan-he-phuong-trinh");
    expect(slugTitle("Đề số 1: (x+1)²")).toBe("De-so-1-x-1");
    expect(slugTitle("  ")).toBe("khong-tieu-de");
  });

  it("builds and parses document keys", () => {
    const key = docKey("mintmath/", { id: "Ab_9-z", title: "Bài 1" });
    expect(key).toBe("mintmath/Bai-1__Ab_9-z.mintmath.json");
    expect(docIdFromKey(key)).toBe("Ab_9-z");
    expect(docIdFromKey("mintmath/x.tex")).toBeNull();
    // Saved before the rename: still a document.
    expect(docIdFromKey("mathpad/Bai-1__Ab_9-z.mathpad.json")).toBe("Ab_9-z");
    expect(isDocKey("mathpad/Bai-1__Ab_9-z.mathpad.json")).toBe(true);
    expect(isDocKey("mintmath/a.tex")).toBe(false);
    expect(displayName(key, "mintmath/")).toBe("Bai-1__Ab_9-z.mintmath.json");
  });
});

describe("planSync", () => {
  const P = "mintmath/";
  const L = (id: string, updatedAt: string, title = "T") => ({ id, title, updatedAt });
  const R = (id: string, etag: string, lastModified = "2026-01-01T00:00:00Z", title = "T") => ({
    key: docKey(P, { id, title }),
    size: 1,
    etag,
    lastModified,
  });

  it("uploads new local documents and downloads new remote ones", () => {
    expect(planSync([L("a", "1")], [R("b", "e")], {}, P)).toEqual([
      { type: "upload", id: "a", key: docKey(P, { id: "a", title: "T" }) },
      { type: "download", id: "b", key: R("b", "e").key },
    ]);
  });

  it("does nothing when neither side changed", () => {
    const state: SyncState = { a: { key: R("a", "e").key, etag: "e", updatedAt: "1" } };
    expect(planSync([L("a", "1")], [R("a", "e")], state, P)).toEqual([]);
  });

  it("uploads local edits and downloads remote edits", () => {
    const state: SyncState = { a: { key: R("a", "e").key, etag: "e", updatedAt: "1" } };
    expect(planSync([L("a", "2")], [R("a", "e")], state, P)).toEqual([
      { type: "upload", id: "a", key: R("a", "e").key },
    ]);
    expect(planSync([L("a", "1")], [R("a", "e2")], state, P)).toEqual([
      { type: "download", id: "a", key: R("a", "e2").key },
    ]);
  });

  it("flags a conflict when both changed, or on a first sync with content on both sides", () => {
    const state: SyncState = { a: { key: R("a", "e").key, etag: "e", updatedAt: "1" } };
    expect(planSync([L("a", "2")], [R("a", "e2")], state, P)).toEqual([
      { type: "conflict", id: "a", key: R("a", "e2").key },
    ]);
    expect(planSync([L("a", "1")], [R("a", "e")], {}, P)).toEqual([
      { type: "conflict", id: "a", key: R("a", "e").key },
    ]);
  });

  it("renames the remote object when the title changed locally", () => {
    const old = R("a", "e", "2026-01-01T00:00:00Z", "Cu");
    const state: SyncState = { a: { key: old.key, etag: "e", updatedAt: "1" } };
    expect(planSync([L("a", "2", "Moi")], [old], state, P)).toEqual([
      { type: "upload", id: "a", key: docKey(P, { id: "a", title: "Moi" }), replaces: old.key },
    ]);
  });

  it("ignores non-document files and keeps the newest of duplicate keys", () => {
    const older = R("a", "e1", "2026-01-01T00:00:00Z", "One");
    const newer = R("a", "e2", "2026-02-01T00:00:00Z", "Two");
    const other = { key: "mintmath/x.pdf", size: 1, etag: "z", lastModified: "2026-03-01T00:00:00Z" };
    expect(planSync([], [older, newer, other], {}, P)).toEqual([
      { type: "download", id: "a", key: newer.key },
    ]);
  });
});

describe("validateConfig refuses a Master Application Key", () => {
  it("rejects a 12-hex-digit keyID (the account ID) and accepts an application keyID", async () => {
    const { validateConfig } = await import("../src/cloud/b2");
    const base = {
      appKey: "K004abc",
      bucket: "my-bucket",
      endpoint: "s3.us-west-004.backblazeb2.com",
      prefix: "mathpad/",
    };
    expect(validateConfig({ ...base, keyId: "0a1b2c3d4e5f" })).toMatch(/Master Application Key/);
    expect(validateConfig({ ...base, keyId: "004a1b2c3d4e5f0000000001" })).toBeNull();
  });
});
