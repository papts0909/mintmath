// @vitest-environment node
// Runs scripts/b2-cors.sh (the command the app shows for macOS / Linux)
// against a fake Backblaze native API, with dash and bash.
import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/b2-cors.sh", import.meta.url));
const GOOD = "Basic " + Buffer.from("masterid:mastersecret").toString("base64");

let server: Server;
let base = "";
let updates: { corsRules: { corsRuleName: string; allowedOrigins: string[] }[]; bucketId: string }[] = [];
let existingRules: unknown[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (status: number, data: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        // Pretty-printed like the real API.
        res.end(JSON.stringify(data, null, 2));
      };
      if (req.url?.endsWith("/b2_authorize_account")) {
        if (req.headers.authorization !== GOOD) return send(401, { code: "unauthorized" });
        return send(200, {
          accountId: "acc1",
          authorizationToken: "tok_123",
          apiInfo: { storageApi: { apiUrl: base, s3ApiUrl: "https://s3.example" } },
        });
      }
      if (req.headers.authorization !== "tok_123") return send(401, { code: "bad_auth_token" });
      const json = JSON.parse(body);
      if (req.url?.endsWith("/b2_list_buckets"))
        return send(200, {
          buckets:
            json.bucketName === "DatNgo"
              ? [{ bucketId: "bkt_9", bucketName: "DatNgo", corsRules: existingRules }]
              : [],
        });
      if (req.url?.endsWith("/b2_update_bucket")) {
        updates.push(json);
        return send(200, { bucketId: json.bucketId, corsRules: json.corsRules });
      }
      send(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

function run(shell: string, args: string[], env: Record<string, string>) {
  // Async server in this process: run the script without blocking the event loop.
  return new Promise<{ status: number | null; out: string }>((resolve) => {
    import("node:child_process").then(({ spawn }) => {
      const p = spawn(shell, [script, ...args], {
        env: { PATH: process.env.PATH!, B2_AUTH_URL: base, ...env },
      });
      let out = "";
      p.stdout.on("data", (c) => (out += c));
      p.stderr.on("data", (c) => (out += c));
      p.on("close", (status) => resolve({ status, out }));
    });
  });
}

const shells = ["dash", "bash"].filter((s) => spawnSync("sh", ["-c", `command -v ${s}`]).status === 0);

describe.each(shells)("b2-cors.sh with %s", (shell) => {
  const keys = { B2_KEY_ID: "masterid", B2_APP_KEY: "mastersecret" };

  it("sets the MathPad CORS rule for the given origins", async () => {
    updates = [];
    existingRules = [];
    const r = await run(shell, ["DatNgo", "https://monglinhnguyendat.id.vn/", "http://localhost:5173"], keys);
    expect(r.out).toContain("✔ Xong");
    expect(r.status).toBe(0);
    expect(updates).toEqual([
      {
        accountId: "acc1",
        bucketId: "bkt_9",
        corsRules: [
          {
            corsRuleName: "mathpad-web",
            allowedOrigins: ["https://monglinhnguyendat.id.vn", "http://localhost:5173"],
            allowedOperations: ["s3_get", "s3_head", "s3_put", "s3_delete"],
            allowedHeaders: ["*"],
            exposeHeaders: ["ETag"],
            maxAgeSeconds: 3600,
          },
        ],
      },
    ]);
  });

  it("warns when other CORS rules are replaced", async () => {
    updates = [];
    existingRules = [{ corsRuleName: "downloadFromAnyOrigin" }, { corsRuleName: "mathpad-web" }];
    const r = await run(shell, ["DatNgo", "https://a.example"], keys);
    existingRules = [];
    expect(r.status).toBe(0);
    expect(r.out).toContain("có 1 quy tắc CORS khác");
  });

  it("explains a wrong key, a missing bucket and bad input", async () => {
    updates = [];
    let r = await run(shell, ["DatNgo", "https://a.example"], { ...keys, B2_APP_KEY: "nope" });
    expect(r.status).toBe(1);
    expect(r.out).toContain("Backblaze không nhận khóa này (mã 401)");

    r = await run(shell, ["Other", "https://a.example"], keys);
    expect(r.status).toBe(1);
    expect(r.out).toContain('Không thấy bucket "Other"');

    r = await run(shell, ["DatNgo"], keys);
    expect(r.out).toContain("Thiếu tên bucket");
    r = await run(shell, ["DatNgo", "javascript:alert(1)"], keys);
    expect(r.out).toContain("Địa chỉ web không hợp lệ");
    r = await run(shell, ['a"b', "https://a.example"], keys);
    expect(r.out).toContain("Tên bucket không hợp lệ");
    expect(updates).toEqual([]);
  });

  it("does not put the key on the command line", async () => {
    const src = await import("node:fs").then((fs) => fs.readFileSync(script, "utf8"));
    expect(src).not.toMatch(/curl[^\n]*-u /);
    expect(src).toContain('-K "$2"');
  });
});
