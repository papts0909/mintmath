import { describe, expect, it, vi } from "vitest";
import { mathpadRule, mergeRules, parseOrigins, setMathpadCors, RULE_NAME } from "../scripts/b2-cors.mjs";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

describe("scripts/b2-cors.mjs", () => {
  it("normalizes origins", () => {
    expect(parseOrigins("monglinhnguyendat.id.vn  https://a.b/x/y, http://localhost:4173")).toEqual([
      "https://monglinhnguyendat.id.vn",
      "https://a.b",
      "http://localhost:4173",
    ]);
    expect(parseOrigins("")).toEqual([]);
  });

  it("keeps other rules and the origins its own rule already allowed", () => {
    const other = { corsRuleName: "other", allowedOrigins: ["*"] };
    const old = { corsRuleName: RULE_NAME, allowedOrigins: ["https://old", "https://new"] };
    const rule = mathpadRule(["https://new"]);
    expect(mergeRules([other, old], rule)).toEqual([
      other,
      { ...rule, allowedOrigins: ["https://old", "https://new"] },
    ]);
    expect(rule.allowedOperations).toEqual(["s3_get", "s3_head", "s3_put", "s3_delete"]);
    expect(rule.allowedHeaders).toEqual(["*"]);
    expect(rule.exposeHeaders).toEqual(["ETag"]);
  });

  it("authorizes, finds the bucket and updates its CORS rules", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const replies = [
      json({
        accountId: "acc",
        authorizationToken: "tok",
        apiInfo: { storageApi: { apiUrl: "https://api004.b2" } },
      }),
      json({ buckets: [{ bucketId: "bid", corsRules: [{ corsRuleName: "keep" }] }] }),
      json({ corsRules: [{ corsRuleName: "keep" }, mathpadRule(["https://x.vn"])] }),
    ];
    const f = vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return replies[calls.length - 1];
    });
    const rules = await setMathpadCors(
      { keyId: "k", appKey: "s", bucketName: "bkt", origins: ["https://x.vn"] },
      f,
    );
    expect(calls[0].url).toBe("https://api.backblazeb2.com/b2api/v3/b2_authorize_account");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      "Basic " + Buffer.from("k:s").toString("base64"),
    );
    expect(calls[1].url).toBe("https://api004.b2/b2api/v3/b2_list_buckets");
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ accountId: "acc", bucketName: "bkt" });
    const update = JSON.parse(calls[2].init.body as string);
    expect(calls[2].url).toBe("https://api004.b2/b2api/v3/b2_update_bucket");
    expect(update.bucketId).toBe("bid");
    expect(update.corsRules.map((r: { corsRuleName: string }) => r.corsRuleName)).toEqual([
      "keep",
      RULE_NAME,
    ]);
    expect(rules).toHaveLength(2);
  });

  it("explains a key without permission to edit the bucket", async () => {
    const f = vi.fn(async (url: string) =>
      url.endsWith("b2_authorize_account")
        ? json({ accountId: "a", authorizationToken: "t", apiInfo: { storageApi: { apiUrl: "https://u" } } })
        : json({ code: "unauthorized", message: "not entitled" }, 401),
    );
    await expect(
      setMathpadCors({ keyId: "k", appKey: "s", bucketName: "b", origins: [] }, f),
    ).rejects.toThrow(/Tìm bucket thất bại.*Master Application Key/);
  });

  it("reports a missing bucket", async () => {
    const f = vi.fn(async (url: string) =>
      url.endsWith("b2_authorize_account")
        ? json({ accountId: "a", authorizationToken: "t", apiInfo: { storageApi: { apiUrl: "https://u" } } })
        : json({ buckets: [] }),
    );
    await expect(
      setMathpadCors({ keyId: "k", appKey: "s", bucketName: "nope", origins: [] }, f),
    ).rejects.toThrow(/Không tìm thấy bucket "nope"/);
  });
});

describe("parseArgs", () => {
  it("reads flags in both forms", async () => {
    const { parseArgs } = await import("../scripts/b2-cors.mjs");
    expect(
      parseArgs([
        "--key-id",
        "k",
        "--app-key=s",
        "--bucket",
        "b",
        "--origin",
        "x.vn",
        "--origin=http://localhost:1",
      ]),
    ).toEqual({
      keyId: "k",
      appKey: "s",
      bucketName: "b",
      origins: ["https://x.vn", "http://localhost:1"],
    });
  });
});
