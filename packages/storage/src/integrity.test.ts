/** Upload integrity (security review M6): exact size on signed PUTs, and sealing to a final key. */
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleLocalStorageRequest, LocalDiskStorage } from "./local";
import { MemoryStorage } from "./memory";
import { orgKey } from "./port";
import { S3Storage } from "./s3";
import { incomingKey, sealUpload } from "./seal";

const SECRET = "local-storage-secret-0123456789abcdef";
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const bytes = (s: string) => new TextEncoder().encode(s);

describe("S3 signed PUT", () => {
  const s3 = new S3Storage({
    bucket: "dueproof",
    endpoint: "https://account.r2.cloudflarestorage.com",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    now: () => Date.UTC(2026, 10, 16, 10, 0, 0),
  });

  it("signs Content-Length and Content-Type when the size is known", async () => {
    const put = await s3.putSignedUrl(incomingKey("o1", "d1"), {
      contentType: "application/pdf",
      size: 1000,
    });
    const signed = new URL(put.url).searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];
    expect(signed).toContain("content-length");
    expect(signed).toContain("content-type");
    // The browser sets Content-Length itself; the caller only sends the type.
    expect(put.headers).toEqual({ "content-type": "application/pdf" });
  });

  it("a different declared size gives a different signature", async () => {
    const a = await s3.putSignedUrl(incomingKey("o1", "d1"), { size: 1000 });
    const b = await s3.putSignedUrl(incomingKey("o1", "d1"), { size: 1001 });
    expect(new URL(a.url).searchParams.get("X-Amz-Signature")).not.toBe(
      new URL(b.url).searchParams.get("X-Amz-Signature"),
    );
  });
});

describe("local signed PUT with an exact size", () => {
  let root: string;
  let storage: LocalDiskStorage;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "dueproof-integrity-"));
    storage = new LocalDiskStorage({
      root,
      publicUrl: "http://localhost:3000/api/storage/local",
      secret: SECRET,
    });
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("refuses a body shorter or longer than signed", async () => {
    const put = await storage.putSignedUrl(incomingKey("o1", "d2"), {
      contentType: "application/pdf",
      size: 8,
    });
    const send = (body: string) =>
      handleLocalStorageRequest(
        storage,
        new Request(put.url, { method: "PUT", headers: put.headers, body }),
      );
    expect((await send("%PDF-1.7-and-more")).status).not.toBe(200);
    expect((await send("%PDF")).status).toBe(400);
    expect(await storage.head(incomingKey("o1", "d2"))).toBeNull();
    expect((await send("%PDF-1.7")).status).toBe(200);
  });

  it("in-process writes are held to the same size", async () => {
    const put = await storage.putSignedUrl(incomingKey("o1", "d3"), { size: 2 });
    expect(await storage.writeSignedUrl(put.url, new Uint8Array(3))).toBe(false);
    expect(await storage.writeSignedUrl(put.url, new Uint8Array(2))).toBe(true);
  });

  it("seals to a final key; a second PUT on the old URL changes nothing checked", async () => {
    const body = bytes("%PDF-1.7 genuine");
    const from = incomingKey("o1", "d4");
    const to = orgKey("o1", "originals", sha(body));
    const put = await storage.putSignedUrl(from, {
      contentType: "application/pdf",
      size: body.byteLength,
    });
    const send = (b: Uint8Array) =>
      handleLocalStorageRequest(
        storage,
        new Request(put.url, { method: "PUT", headers: put.headers, body: b as BodyInit }),
      );
    expect((await send(body)).status).toBe(200);
    const sealed = await sealUpload(storage, from, to, {
      size: body.byteLength,
      sha256: sha(body),
      maxBytes: 1024,
    });
    expect(sealed).toMatchObject({ ok: true, sha256: sha(body) });
    expect(await storage.head(from)).toBeNull();

    // The URL is still within its five minutes: a replacement lands on the incoming key only.
    const evil = bytes("%PDF-1.7 forgery");
    expect(evil.byteLength).toBe(body.byteLength);
    expect((await send(evil)).status).toBe(200);
    expect(await storage.get(to)).toEqual(body);
  });

  it("a crash after the copy is retried against the final key", async () => {
    const body = bytes("%PDF-retry");
    const to = orgKey("o1", "originals", sha(body));
    await storage.put(to, body);
    const again = await sealUpload(storage, incomingKey("o1", "gone"), to, {
      size: body.byteLength,
      sha256: sha(body),
      maxBytes: 1024,
    });
    expect(again.ok).toBe(true);
  });
});

describe("sealUpload", () => {
  it("refuses an oversized object from its metadata, before reading it", async () => {
    const m = new MemoryStorage();
    let streamed = false;
    const spy = Object.assign(Object.create(m), {
      getStream: async (key: string) => {
        streamed = true;
        return m.getStream(key);
      },
    }) as MemoryStorage;
    const from = incomingKey("o1", "big");
    await m.put(from, new Uint8Array(4096));
    const out = await sealUpload(spy, from, orgKey("o1", "originals", "x"), {
      size: 10,
      sha256: "0".repeat(64),
      maxBytes: 1024,
    });
    expect(out).toEqual({ ok: false, problem: "too_large" });
    expect(streamed).toBe(false);
    expect(await m.head(from)).toBeNull();
  });

  it("reports a size or hash mismatch and keeps nothing", async () => {
    const m = new MemoryStorage();
    const from = incomingKey("o1", "d5");
    const to = orgKey("o1", "originals", "y");
    await m.put(from, bytes("abc"));
    expect(
      await sealUpload(m, from, to, { size: 4, sha256: "0".repeat(64), maxBytes: 99 }),
    ).toEqual({ ok: false, problem: "size_mismatch" });
    await m.put(from, bytes("abc"));
    expect(
      await sealUpload(m, from, to, { size: 3, sha256: "0".repeat(64), maxBytes: 99 }),
    ).toEqual({ ok: false, problem: "hash_mismatch" });
    expect(await m.head(from)).toBeNull();
    expect(await m.head(to)).toBeNull();
  });

  it("returns the leading bytes for the magic-number check", async () => {
    const m = new MemoryStorage();
    const body = bytes("%PDF-1.7");
    await m.put(incomingKey("o1", "d6"), body);
    const out = await sealUpload(m, incomingKey("o1", "d6"), orgKey("o1", "originals", "z"), {
      size: body.byteLength,
      sha256: sha(body),
      maxBytes: 99,
    });
    expect(out.ok && new TextDecoder().decode(out.head)).toBe("%PDF-1.7");
  });

  it("not uploaded yet", async () => {
    const m = new MemoryStorage();
    expect(
      await sealUpload(m, incomingKey("o1", "none"), orgKey("o1", "originals", "n"), {
        size: 1,
        sha256: "0".repeat(64),
        maxBytes: 9,
      }),
    ).toEqual({ ok: false, problem: "not_uploaded" });
  });
});
