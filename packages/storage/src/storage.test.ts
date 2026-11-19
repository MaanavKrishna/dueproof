import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleLocalStorageRequest, LocalDiskStorage } from "./local";
import { MemoryStorage } from "./memory";
import { assertKey, keyOrg, MAX_SIGNED_URL_SECONDS, orgKey } from "./port";
import { S3Storage } from "./s3";

const SECRET = "local-storage-secret-0123456789abcdef";

describe("keys", () => {
  it("are prefixed by organisation", () => {
    expect(orgKey("o1", "originals", "ab.pdf")).toBe("org/o1/originals/ab.pdf");
    expect(keyOrg("org/o1/pages/1.webp")).toBe("o1");
  });
  it("reject traversal and other organisations", () => {
    expect(() => orgKey("o1", "..", "x")).toThrow();
    expect(() => orgKey("o1", "a/b")).not.toThrow(); // joined as two segments
    expect(() => assertKey("org/o1/../o2/x")).toThrow();
    expect(() => assertKey("tmp/x")).toThrow();
    expect(() => assertKey("org/o1/x", "o2")).toThrow(/another organisation/);
    expect(() => assertKey("org/o1//x")).toThrow();
  });
});

describe("LocalDiskStorage", () => {
  let root: string;
  let now = Date.UTC(2026, 10, 16, 10, 0, 0);
  let storage: LocalDiskStorage;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "dueproof-storage-"));
    storage = new LocalDiskStorage({
      root,
      publicUrl: "http://localhost:3000/api/storage/local",
      secret: SECRET,
      maxPutBytes: 1024,
      now: () => now,
    });
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("puts, gets, heads and deletes", async () => {
    const key = orgKey("o1", "originals", "a.pdf");
    await storage.put(key, new TextEncoder().encode("%PDF-1.7"), {
      contentType: "application/pdf",
    });
    expect(new TextDecoder().decode((await storage.get(key)) ?? new Uint8Array())).toBe("%PDF-1.7");
    expect(await storage.head(key)).toEqual({ size: 8, contentType: "application/pdf" });
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });

  it("signed PUT then signed GET through the route handler", async () => {
    const key = orgKey("o1", "originals", "b.pdf");
    const put = await storage.putSignedUrl(key, {
      contentType: "application/pdf",
      expiresIn: 3600,
    });
    expect(put.expiresAt.getTime() - now).toBe(MAX_SIGNED_URL_SECONDS * 1000);
    const res = await handleLocalStorageRequest(
      storage,
      new Request(put.url, { method: "PUT", headers: put.headers, body: "%PDF-hello" }),
    );
    expect(res.status).toBe(200);
    const get = await storage.getSignedUrl(key);
    const got = await handleLocalStorageRequest(storage, new Request(get.url));
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("application/pdf");
    expect(await got.text()).toBe("%PDF-hello");
    expect(
      new TextDecoder().decode((await storage.readSignedUrl(get.url)) ?? new Uint8Array()),
    ).toBe("%PDF-hello");
  });

  it("refuses tampered, expired, wrong-method and oversized requests", async () => {
    const key = orgKey("o1", "originals", "c.pdf");
    const put = await storage.putSignedUrl(key, { contentType: "application/pdf" });

    const tampered = new URL(put.url);
    const [body, mac] = (tampered.searchParams.get("token") ?? "").split(".");
    const forged = JSON.parse(Buffer.from(body ?? "", "base64url").toString());
    forged.k = "org/o2/originals/c.pdf";
    tampered.searchParams.set(
      "token",
      `${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${mac}`,
    );
    expect(
      (
        await handleLocalStorageRequest(
          storage,
          new Request(tampered, { method: "PUT", body: "x" }),
        )
      ).status,
    ).toBe(403);

    expect((await handleLocalStorageRequest(storage, new Request(put.url))).status).toBe(405);

    const wrongType = await handleLocalStorageRequest(
      storage,
      new Request(put.url, {
        method: "PUT",
        headers: { "content-type": "text/html" },
        body: "<x>",
      }),
    );
    expect(wrongType.status).toBe(400);

    const big = await handleLocalStorageRequest(
      storage,
      new Request(put.url, { method: "PUT", headers: put.headers, body: new Uint8Array(2048) }),
    );
    expect(big.status).toBe(413);

    now += 301_000;
    expect(
      (
        await handleLocalStorageRequest(
          storage,
          new Request(put.url, { method: "PUT", headers: put.headers, body: "x" }),
        )
      ).status,
    ).toBe(403);
  });

  it("will not resolve a path outside the root", async () => {
    await expect(storage.get("org/o1/../../etc/passwd")).rejects.toThrow();
  });
});

describe("S3Storage (R2)", () => {
  const s3 = new S3Storage({
    bucket: "dueproof",
    endpoint: "https://account.r2.cloudflarestorage.com",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    now: () => Date.UTC(2026, 10, 16, 10, 0, 0),
  });

  it("presigns PUT and GET for at most five minutes", async () => {
    const put = await s3.putSignedUrl(orgKey("o1", "originals", "x.pdf"), {
      contentType: "application/pdf",
      expiresIn: 86_400,
    });
    const u = new URL(put.url);
    expect(u.hostname).toBe("dueproof.account.r2.cloudflarestorage.com");
    expect(u.pathname).toBe("/org/o1/originals/x.pdf");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toContain("content-type");
    expect(put.headers["content-type"]).toBe("application/pdf");

    const get = await s3.getSignedUrl(orgKey("o1", "originals", "x.pdf"));
    expect(new URL(get.url).searchParams.get("X-Amz-Expires")).toBe("300");
  });

  it("signs only what the browser sends: no checksum of an empty body", async () => {
    // The SDK's default added x-amz-checksum-crc32=AAAAAA== (CRC32 of nothing)
    // to presigned PUTs, so R2/S3 refused every real upload from the browser.
    const put = await s3.putSignedUrl(orgKey("o1", "originals", "x.pdf"), {
      contentType: "application/pdf",
    });
    const q = new URL(put.url).searchParams;
    const amz = [...q.keys()].filter((k) => k.toLowerCase().startsWith("x-amz-checksum"));
    expect(amz).toEqual([]);
    expect(q.get("x-amz-sdk-checksum-algorithm")).toBeNull();
    // A cross-origin PUT carries exactly these headers, and CORS must allow them.
    expect(q.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(Object.keys(put.headers)).toEqual(["content-type"]);
    expect(put.method).toBe("PUT");

    const get = new URL((await s3.getSignedUrl(orgKey("o1", "originals", "x.pdf"))).url);
    expect(get.searchParams.get("x-amz-checksum-mode")).toBeNull();
    expect(get.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  });

  it("signs path-style URLs for MinIO", async () => {
    const minio = new S3Storage({
      bucket: "dueproof",
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      forcePathStyle: true,
      accessKeyId: "minio",
      secretAccessKey: "minio-secret",
      now: () => Date.UTC(2026, 10, 16, 10, 0, 0),
    });
    const put = new URL((await minio.putSignedUrl(orgKey("o1", "originals", "x.pdf"))).url);
    expect(put.origin).toBe("http://localhost:9000");
    expect(put.pathname).toBe("/dueproof/org/o1/originals/x.pdf");
    expect(put.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
  });

  it("rejects bad keys before signing", async () => {
    await expect(s3.getSignedUrl("org/o1/../x")).rejects.toThrow();
  });
});

describe("MemoryStorage", () => {
  it("round-trips signed URLs in-process", async () => {
    const m = new MemoryStorage();
    const put = await m.putSignedUrl("org/o1/p/1.webp");
    expect(await m.writeSignedUrl(put.url, new Uint8Array([1, 2]))).toBe(true);
    const get = await m.getSignedUrl("org/o1/p/1.webp");
    expect(await m.readSignedUrl(get.url)).toEqual(new Uint8Array([1, 2]));
  });
});
