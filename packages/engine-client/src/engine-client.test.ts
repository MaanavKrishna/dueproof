import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createEngineClient, EngineError } from "./client";
import { BUILTIN_RECORDINGS, createFakeEngine, createFakeEngineHandler } from "./fake";
import { signEngineToken, verifyEngineToken } from "./token";

const SECRET = "engine-shared-secret-0123456789abcdef";
const FIXTURE = new URL(
  "../../../services/engine/tests/fixtures/notice-gst-asmt10.pdf",
  import.meta.url,
);

describe("engine token", () => {
  const now = Date.UTC(2026, 10, 16, 10, 0, 0);

  it("is base64url(payload).base64url(hmac) with exp and aud", () => {
    const token = signEngineToken(SECRET, { now, ttlSeconds: 60 });
    const [body] = token.split(".");
    expect(JSON.parse(Buffer.from(body ?? "", "base64url").toString())).toEqual({
      exp: now / 1000 + 60,
      aud: "engine",
    });
    expect(token).not.toMatch(/[=+/]/);
    expect(verifyEngineToken(SECRET, token, now)).toEqual({ exp: now / 1000 + 60, aud: "engine" });
  });

  it("matches a known vector (shared with services/engine)", () => {
    // payload {"exp":1794830460,"aud":"engine"}, secret above.
    const token = signEngineToken(SECRET, { now: 1_794_830_400_000, ttlSeconds: 60 });
    expect(token).toBe(
      "eyJleHAiOjE3OTQ4MzA0NjAsImF1ZCI6ImVuZ2luZSJ9.zb0pHzupMiTYoyiiXl5iA4GQdb0pm0l2SzdaBAJep1A",
    );
  });

  it("rejects wrong secret, expiry, audience and far-future tokens", () => {
    const token = signEngineToken(SECRET, { now });
    expect(verifyEngineToken("another-secret-another-secret-12345", token, now)).toBeNull();
    expect(verifyEngineToken(SECRET, token, now + 10 * 60_000)).toBeNull();
    const body = Buffer.from(JSON.stringify({ exp: now / 1000 + 60, aud: "app" })).toString(
      "base64url",
    );
    const forged = `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`;
    expect(verifyEngineToken(SECRET, forged, now)).toBeNull();
    expect(() => signEngineToken("short")).toThrow();
  });
});

describe("fake engine", () => {
  const pdf = new Uint8Array(readFileSync(FIXTURE));
  const images: string[] = [];
  const fake = createFakeEngine({
    fetchSource: async (url) => (url === "https://storage.test/src" ? pdf : null),
    putObject: async (url) => {
      images.push(url);
    },
  });

  it("serves the ASMT-10 recording by content hash", async () => {
    const inspect = await fake.inspect({
      sourceUrl: "https://storage.test/src",
      mime: "application/pdf",
    });
    expect(inspect).toMatchObject({ ok: true, pageCount: 1, textLayerPages: [1] });
    const read = await fake.read({
      sourceUrl: "https://storage.test/src",
      mime: "application/pdf",
      pageImagePutUrls: ["https://storage.test/p1"],
    });
    expect(read.pages[0]?.text).toContain("ASMT-10");
    expect(images).toEqual(["https://storage.test/p1"]);
    const analyze = await fake.analyze({ pages: read.pages });
    expect(analyze.confident).toBe(true);
    expect(analyze.findings.map((f) => f.kind)).toContain("hearing");
  });

  it("links quotes to word boxes", async () => {
    const pages = BUILTIN_RECORDINGS[0]?.read.pages ?? [];
    const res = await fake.link({
      pages,
      quotes: [
        { id: "a", text: "A personal hearing is fixed on 18 November 2026", pageHint: 1 },
        { id: "b", text: "You are hereby directed to explain the discrepancies and pay the tax" },
        { id: "c", text: "not on the page at all" },
      ],
    });
    expect(res.matches[0]).toMatchObject({ id: "a", page: 1, grade: "exact" });
    expect(res.matches[0]?.rects).toHaveLength(1);
    expect(res.matches[1]?.grade).toBe("exact");
    expect(res.matches[2]).toMatchObject({ id: "c", grade: "unlocated", rects: [] });
  });
});

describe("HTTP client against the fake handler", () => {
  const pdf = new Uint8Array(readFileSync(FIXTURE));
  const fake = createFakeEngine({ fetchSource: async () => pdf });
  const handler = createFakeEngineHandler(fake, SECRET);
  const calls: Request[] = [];
  const fetchViaHandler: typeof fetch = async (input, init) => {
    const req = new Request(input as string, init);
    calls.push(req.clone());
    return handler(req);
  };

  it("signs, validates and parses", async () => {
    const client = createEngineClient({
      baseUrl: "http://engine:8000/",
      secret: SECRET,
      fetch: fetchViaHandler,
    });
    const res = await client.inspect({
      sourceUrl: "https://storage.test/src",
      mime: "application/pdf",
    });
    expect(res.pageCount).toBe(1);
    expect(new URL(calls[0]?.url ?? "").pathname).toBe("/v1/inspect");
    expect(calls[0]?.headers.get("authorization")).toMatch(/^Bearer [\w-]+\.[\w-]+$/);
  });

  it("rejects an invalid request before sending", async () => {
    const client = createEngineClient({
      baseUrl: "http://engine:8000",
      secret: SECRET,
      fetch: fetchViaHandler,
    });
    const before = calls.length;
    await expect(
      client.inspect({ sourceUrl: "not a url", mime: "application/pdf" }),
    ).rejects.toBeInstanceOf(EngineError);
    expect(calls.length).toBe(before);
  });

  it("refuses a caller with the wrong secret", async () => {
    const client = createEngineClient({
      baseUrl: "http://engine:8000",
      secret: "wrong-secret-wrong-secret-wrong-secret",
      fetch: fetchViaHandler,
    });
    await expect(
      client.inspect({ sourceUrl: "https://storage.test/src", mime: "application/pdf" }),
    ).rejects.toMatchObject({ status: 401, retryable: false });
  });

  it("rejects a response that breaks the contract", async () => {
    const client = createEngineClient({
      baseUrl: "http://engine:8000",
      secret: SECRET,
      fetch: async () => Response.json({ ok: "yes" }),
    });
    await expect(
      client.inspect({ sourceUrl: "https://storage.test/src", mime: "application/pdf" }),
    ).rejects.toThrow(/broke the contract/);
  });

  it("marks 5xx as retryable", async () => {
    const client = createEngineClient({
      baseUrl: "http://engine:8000",
      secret: SECRET,
      fetch: async () => new Response("boom", { status: 503 }),
    });
    await expect(
      client.inspect({ sourceUrl: "https://storage.test/src", mime: "application/pdf" }),
    ).rejects.toMatchObject({ status: 503, retryable: true });
  });
});
