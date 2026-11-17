#!/usr/bin/env node
// Set the CORS rule a Backblaze B2 bucket needs for the MathPad web app / PWA.
// Needs only Node 18+ (built-in fetch). No B2 CLI, no other install.
//
//   node scripts/b2-cors.mjs
//   node scripts/b2-cors.mjs --bucket my-bucket --origin https://example.com
//   B2_KEY_ID=… B2_APP_KEY=… B2_BUCKET=… B2_ORIGINS="https://a https://b" node scripts/b2-cors.mjs
//
// It asks for a keyID / applicationKey that may edit bucket settings (the
// Master Application Key, or a key with the listBuckets + writeBuckets
// capabilities), the bucket name and the web addresses MathPad runs on.
// Existing CORS rules of the bucket are kept; only the rule named
// "mathpad-web" is added or replaced.
import { createInterface } from "node:readline/promises";
import { argv, stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";

export const RULE_NAME = "mathpad-web";

export const DEFAULT_ORIGINS = [
  "https://papts0909.github.io",
  "http://localhost:4173",
  "http://localhost:5173",
];

/** The CORS rule MathPad's S3 calls need: signed list/get/put/delete. */
export function mathpadRule(origins) {
  return {
    corsRuleName: RULE_NAME,
    allowedOrigins: origins,
    allowedOperations: ["s3_get", "s3_head", "s3_put", "s3_delete"],
    allowedHeaders: ["*"],
    exposeHeaders: ["ETag"],
    maxAgeSeconds: 3600,
  };
}

/** Normalize user input to origins: scheme + host (+ port), no path. */
export function parseOrigins(text) {
  const out = [];
  for (const raw of text.split(/[\s,]+/)) {
    if (!raw) continue;
    let u;
    try {
      u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      throw new Error(`Địa chỉ không hợp lệ: ${raw}`);
    }
    if (!out.includes(u.origin)) out.push(u.origin);
  }
  return out;
}

/** Keep other rules, add/replace ours. */
export function mergeRules(existing, rule) {
  return [...(existing ?? []).filter((r) => r.corsRuleName !== rule.corsRuleName), rule];
}

async function b2(fetchImpl, url, init, what) {
  let res;
  try {
    res = await fetchImpl(url, init);
  } catch {
    throw new Error(`${what}: không kết nối được tới ${new URL(url).host} (kiểm tra mạng / tường lửa).`);
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const hint =
      what === "Đăng nhập B2"
        ? " (sai keyID / applicationKey)"
        : res.status === 401 || data.code === "unauthorized"
          ? " (khóa này không có quyền sửa bucket — dùng Master Application Key, hoặc khóa có quyền listBuckets + writeBuckets)"
          : "";
    throw new Error(`${what} thất bại: ${res.status} ${data.code ?? ""} ${data.message ?? ""}${hint}`.trim());
  }
  return data;
}

/** Authorize, find the bucket, update its CORS rules. Returns the new rules. */
export async function setMathpadCors({ keyId, appKey, bucketName, origins }, fetchImpl = fetch) {
  const auth = await b2(
    fetchImpl,
    "https://api.backblazeb2.com/b2api/v3/b2_authorize_account",
    { headers: { Authorization: "Basic " + Buffer.from(`${keyId}:${appKey}`).toString("base64") } },
    "Đăng nhập B2",
  );
  const apiUrl = auth.apiInfo?.storageApi?.apiUrl ?? auth.apiUrl;
  const headers = { Authorization: auth.authorizationToken, "Content-Type": "application/json" };
  const list = await b2(
    fetchImpl,
    `${apiUrl}/b2api/v3/b2_list_buckets`,
    { method: "POST", headers, body: JSON.stringify({ accountId: auth.accountId, bucketName }) },
    "Tìm bucket",
  );
  const bucket = list.buckets?.[0];
  if (!bucket) throw new Error(`Không tìm thấy bucket "${bucketName}" trong tài khoản này.`);
  const corsRules = mergeRules(bucket.corsRules, mathpadRule(origins));
  const updated = await b2(
    fetchImpl,
    `${apiUrl}/b2api/v3/b2_update_bucket`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ accountId: auth.accountId, bucketId: bucket.bucketId, corsRules }),
    },
    "Cập nhật CORS",
  );
  return updated.corsRules ?? corsRules;
}

/** --key-id X --app-key Y --bucket Z --origin A --origin B */
export function parseArgs(args) {
  const out = { origins: [] };
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split("=", 2);
    const val = () => inline ?? args[++i] ?? "";
    if (flag === "--key-id") out.keyId = val();
    else if (flag === "--app-key") out.appKey = val();
    else if (flag === "--bucket") out.bucketName = val();
    else if (flag === "--origin") out.origins.push(...parseOrigins(val()));
  }
  return out;
}

async function main() {
  const given = parseArgs(argv.slice(2));
  // Keys may come from the environment (e.g. GitHub Actions secrets) so they
  // never appear on a command line.
  given.keyId ??= process.env.B2_KEY_ID || undefined;
  given.appKey ??= process.env.B2_APP_KEY || undefined;
  given.bucketName ??= process.env.B2_BUCKET || undefined;
  if (!given.origins.length && process.env.B2_ORIGINS)
    given.origins.push(...parseOrigins(process.env.B2_ORIGINS));
  const complete = Boolean(given.keyId && given.appKey && given.bucketName);
  // Interactive in a terminal; when input is piped, read all lines up front;
  // with everything given (flags/env), ask nothing.
  const piped = complete
    ? []
    : stdin.isTTY
      ? null
      : await new Promise((r) => {
          let buf = "";
          stdin.setEncoding("utf8");
          stdin.on("data", (c) => (buf += c));
          stdin.on("end", () => r(buf.split(/\r?\n/)));
        });
  const rl = piped ? null : createInterface({ input: stdin, output: stdout });
  const ask = async (q) => {
    if (piped) {
      stdout.write(q + "\n");
      return piped.shift() ?? "";
    }
    return rl.question(q);
  };
  try {
    console.log("Đặt CORS cho bucket Backblaze B2 để dùng MathPad bản web.\n");
    const keyId = (
      given.keyId ?? (await ask("keyID (Master Application Key hoặc khóa có quyền writeBuckets): "))
    ).trim();
    const appKey = (given.appKey ?? (await ask("applicationKey: "))).trim();
    const bucketName = (given.bucketName ?? (await ask("Tên bucket: "))).trim();
    const extra =
      given.origins.length || complete
        ? given.origins.join(" ")
        : await ask(
            `Địa chỉ web của MathPad (cách nhau bằng dấu cách; Enter để chỉ dùng mặc định)\n  luôn thêm: ${DEFAULT_ORIGINS.join(" ")}\n> `,
          );
    if (!keyId || !appKey || !bucketName) throw new Error("Cần keyID, applicationKey và tên bucket.");
    const origins = [...new Set([...parseOrigins(extra), ...DEFAULT_ORIGINS])];
    const rules = await setMathpadCors({ keyId, appKey, bucketName, origins });
    const mine = rules.find((r) => r.corsRuleName === RULE_NAME);
    console.log("\n✔ Đã đặt CORS cho bucket", bucketName);
    console.log("  Cho phép các địa chỉ:", (mine?.allowedOrigins ?? origins).join(", "));
    console.log("  Mở lại MathPad và bấm Kết nối (có thể cần tải lại trang).");
  } catch (e) {
    console.error("\n✘", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    rl?.close();
  }
}

if (argv[1] && import.meta.url === pathToFileURL(argv[1]).href) void main();
