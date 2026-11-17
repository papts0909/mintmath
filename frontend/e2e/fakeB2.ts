// In-memory stand-in for Backblaze B2's S3-compatible API (enough for MintMath).
import type { Page, Route } from "@playwright/test";

export const FAKE_B2 = {
  keyId: "004fakekeyid0000000000001",
  appKey: "K004fakeapplicationkey",
  bucket: "mintmath-test",
  endpoint: "s3.us-west-004.backblazeb2.com",
};

export interface FakeObject {
  body: Buffer;
  type: string;
  etag: string;
  lastModified: string;
}

export type FakeBucket = Map<string, FakeObject>;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, DELETE, HEAD",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "ETag",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

let tick = 0;

export async function installFakeB2(page: Page, bucket: FakeBucket): Promise<void> {
  await page.route(`https://${FAKE_B2.endpoint}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const auth = (await req.allHeaders())["authorization"] ?? "";
    const err = (status: number, code: string) =>
      route.fulfill({
        status,
        headers: { ...CORS, "content-type": "application/xml" },
        body: `<Error><Code>${code}</Code><Message>${code}</Message></Error>`,
      });
    if (!auth.includes(`Credential=${FAKE_B2.keyId}/`)) return err(403, "InvalidAccessKeyId");

    const url = new URL(req.url());
    const [, bucketName, ...rest] = url.pathname.split("/");
    if (decodeURIComponent(bucketName) !== FAKE_B2.bucket) return err(404, "NoSuchBucket");
    const key = rest.map(decodeURIComponent).join("/");

    if (!key && req.method() === "GET") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const max = Number(url.searchParams.get("max-keys") ?? "1000");
      const items = [...bucket.entries()].filter(([k]) => k.startsWith(prefix)).slice(0, max);
      const body = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${FAKE_B2.bucket}</Name>
        <IsTruncated>false</IsTruncated>
        ${items
          .map(
            ([k, o]) =>
              `<Contents><Key>${esc(k)}</Key><Size>${o.body.length}</Size><LastModified>${o.lastModified}</LastModified><ETag>"${o.etag}"</ETag></Contents>`,
          )
          .join("")}
      </ListBucketResult>`;
      return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/xml" }, body });
    }
    if (req.method() === "PUT") {
      const etag = `etag${++tick}`;
      bucket.set(key, {
        body: req.postDataBuffer() ?? Buffer.alloc(0),
        type: (await req.allHeaders())["content-type"] ?? "application/octet-stream",
        etag,
        lastModified: new Date(Date.now() + tick).toISOString(),
      });
      return route.fulfill({ status: 200, headers: { ...CORS, etag: `"${etag}"` }, body: "" });
    }
    const obj = bucket.get(key);
    if (req.method() === "DELETE") {
      bucket.delete(key);
      return route.fulfill({ status: 204, headers: CORS });
    }
    if (!obj) return err(404, "NoSuchKey");
    return route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": obj.type, etag: `"${obj.etag}"` },
      body: obj.body,
    });
  });
}

export const docKeys = (bucket: FakeBucket) =>
  [...bucket.keys()].filter((k) => k.endsWith(".mintmath.json")).sort();
export const textOf = (bucket: FakeBucket, key: string) => bucket.get(key)!.body.toString("utf-8");
