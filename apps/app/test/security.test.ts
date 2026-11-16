/**
 * Security headers and CSP (05 §3), the proxy that applies them, rate limits
 * (05 §3a) on PGlite, and the health/metrics endpoints (03 §12).
 */
import { createDatabase, type Database, migrate } from "@dueproof/db";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Env, parseEnv } from "../lib/env";
import {
  clientIp,
  enforce,
  limitAuth,
  limitRequest,
  MemoryRateLimitStore,
  PostgresRateLimitStore,
  parseOverrides,
  RateLimitedError,
  rateLimitCounters,
  rulesFor,
  setRateLimitStore,
} from "../lib/rate-limit";
import {
  commonSecurityHeaders,
  contentSecurityPolicy,
  storageHosts,
  storageOrigins,
} from "../lib/security/headers";
import type { Container } from "../lib/server/container";
import { checkEngine, health, metrics, metricsAllowed } from "../lib/server/diagnostics";
import { proxy, config as proxyConfig } from "../proxy";

const SECRET = "x".repeat(40);

describe("content security policy", () => {
  const csp = contentSecurityPolicy({
    nonce: "abc123",
    dev: false,
    https: true,
    storageOrigins: ["https://bucket.acct.r2.cloudflarestorage.com"],
  });
  const directives = new Map(
    csp.split("; ").map((d) => {
      const [k, ...v] = d.split(" ");
      return [k, v.join(" ")];
    }),
  );

  it("allows scripts only by nonce, with strict-dynamic and no eval in production", () => {
    expect(directives.get("script-src")).toBe("'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(directives.get("style-src")).toBe("'self' 'nonce-abc123'");
  });

  it("forbids framing, plugins and base-tag tricks", () => {
    expect(directives.get("frame-ancestors")).toBe("'none'");
    expect(directives.get("object-src")).toBe("'none'");
    expect(directives.get("base-uri")).toBe("'none'");
    expect(directives.has("upgrade-insecure-requests")).toBe(true);
  });

  it("lets the browser reach signed storage URLs and nothing else", () => {
    expect(directives.get("img-src")).toContain("https://bucket.acct.r2.cloudflarestorage.com");
    expect(directives.get("connect-src")).toBe(
      "'self' https://bucket.acct.r2.cloudflarestorage.com",
    );
  });

  it("adds eval and the HMR socket only in development", () => {
    const dev = contentSecurityPolicy({ nonce: "n", dev: true, https: false, storageOrigins: [] });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
    // Turbopack's dev CSS has no nonce: without this, pages reload in a loop.
    expect(dev).toContain("style-src 'self' 'unsafe-inline'");
  });
});

describe("storage origins", () => {
  const s3 = {
    STORAGE_DRIVER: "s3" as const,
    S3_BUCKET: "dueproof",
    S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
  };
  it("covers virtual-hosted and path-style R2 URLs", () => {
    expect(storageOrigins(s3)).toEqual([
      "https://dueproof.acct.r2.cloudflarestorage.com",
      "https://acct.r2.cloudflarestorage.com",
    ]);
    expect(storageOrigins({ ...s3, S3_FORCE_PATH_STYLE: true })).toEqual([
      "https://acct.r2.cloudflarestorage.com",
    ]);
    expect(storageHosts(s3)).toEqual([
      "dueproof.acct.r2.cloudflarestorage.com",
      "acct.r2.cloudflarestorage.com",
    ]);
  });
  it("is the app itself for local disk", () => {
    expect(storageOrigins({ STORAGE_DRIVER: "local" })).toEqual([]);
    expect(storageHosts({ STORAGE_DRIVER: "vercel-blob" })).toEqual(["*.blob.vercel-storage.com"]);
  });
});

describe("common headers", () => {
  it("send HSTS only over https, with preload only on hosted", () => {
    expect(commonSecurityHeaders({ https: false, preload: false })).not.toHaveProperty(
      "Strict-Transport-Security",
    );
    expect(commonSecurityHeaders({ https: true, preload: true })["Strict-Transport-Security"]).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    const h = commonSecurityHeaders({ https: true, preload: false });
    expect(h["Strict-Transport-Security"]).not.toContain("preload");
    expect(h).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    });
    expect(h["Permissions-Policy"]).toContain("geolocation=()");
  });
});

describe("proxy", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = SECRET;
    process.env.APP_URL = "https://app.example.in";
    process.env.DUEPROOF_EDITION = "hosted";
  });

  it("gives each page request its own nonce, on the request and the response", () => {
    const a = proxy(new NextRequest("https://app.example.in/inbox"));
    const b = proxy(new NextRequest("https://app.example.in/inbox"));
    const csp = a.headers.get("content-security-policy") ?? "";
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(b.headers.get("content-security-policy")).not.toContain(nonce as string);
    // Next.js reads the nonce from the forwarded request headers.
    expect(a.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    expect(a.headers.get("strict-transport-security")).toContain("preload");
    expect(a.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("gives API responses a deny-all policy and keeps a sane incoming request id", () => {
    const res = proxy(
      new NextRequest("https://app.example.in/api/v1/uploads", {
        headers: { "x-request-id": "req-12345678" },
      }),
    );
    expect(res.headers.get("content-security-policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    expect(res.headers.get("x-request-id")).toBe("req-12345678");
    const bad = proxy(
      new NextRequest("https://app.example.in/api/x", { headers: { "x-request-id": "<script>" } }),
    );
    expect(bad.headers.get("x-request-id")).not.toBe("<script>");
  });

  it("leaves the Workflow DevKit routes and build assets out", () => {
    const source = proxyConfig.matcher[0]?.source ?? "";
    const re = new RegExp(`^${source}$`);
    expect(re.test("/inbox")).toBe(true);
    expect(re.test("/api/v1/uploads")).toBe(true);
    expect(re.test("/.well-known/workflow/v1/flow")).toBe(false);
    expect(re.test("/_next/static/chunks/a.js")).toBe(false);
  });
});

// ---------------------------------------------------------------- rate limits

describe("rate limit rules", () => {
  it("reads overrides and refuses nonsense", () => {
    expect(parseOverrides("upload.user=100/1h, search.user=60/30s")).toEqual({
      "upload.user": { limit: 100, windowMs: 3_600_000 },
      "search.user": { limit: 60, windowMs: 30_000 },
    });
    expect(() => parseOverrides("upload.everyone=1/1h")).toThrow(/RATE_LIMITS/);
    expect(() => parseOverrides("upload.user=lots")).toThrow(/RATE_LIMITS/);
  });

  it("are stricter on hosted sign-up", () => {
    expect(
      rulesFor({ DUEPROOF_EDITION: "hosted", RATE_LIMITS: undefined })["signup.ip"].limit,
    ).toBe(3);
    expect(
      rulesFor({ DUEPROOF_EDITION: "self-hosted", RATE_LIMITS: undefined })["signup.ip"].limit,
    ).toBe(20);
  });

  it("take the client IP from our own proxy's header", () => {
    const r = new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.2" } });
    expect(clientIp(r, { AUTH_IP_HEADER: undefined })).toBe("203.0.113.9");
    const v = new Request("http://x", { headers: { "x-real-ip": "198.51.100.4" } });
    expect(clientIp(v, { AUTH_IP_HEADER: "x-real-ip" })).toBe("198.51.100.4");
    expect(clientIp(new Request("http://x"), { AUTH_IP_HEADER: undefined })).toBe("unknown");
  });
});

describe("rate limits on Postgres", () => {
  let database: Database;
  let c: Container;
  let env: Env;

  beforeAll(async () => {
    database = await createDatabase({ driver: "pglite" });
    await migrate(database);
    env = parseEnv({
      NODE_ENV: "test",
      AUTH_SECRET: SECRET,
      RATE_LIMITS: "upload.user=3/1h,auth.account=2/15m,auth.ip=100/15m",
    });
    c = { env, database } as unknown as Container;
  });
  afterAll(async () => {
    await database.close();
  });

  it("counts per key and window, and refuses with Retry-After past the limit", async () => {
    const now = Date.UTC(2026, 10, 16, 10, 0, 0);
    for (let i = 0; i < 3; i++) await enforce(c, "upload.user", "user-1", { now });
    const err = await enforce(c, "upload.user", "user-1", { now }).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect(err).toMatchObject({ status: 429, rule: "upload.user", retryAfterSeconds: 3600 });
    // Another user is unaffected.
    await enforce(c, "upload.user", "user-2", { now });
    // Sliding: right after the window ends the last one still counts in full...
    await expect(enforce(c, "upload.user", "user-1", { now: now + 3_600_000 })).rejects.toThrow(
      RateLimitedError,
    );
    // ...and a window later it has slid out.
    await enforce(c, "upload.user", "user-1", { now: now + 2 * 3_600_000 });
    expect(rateLimitCounters().get("upload.user")).toBeGreaterThanOrEqual(1);
  });

  it("stores hashed keys, not the subject", async () => {
    const store = new PostgresRateLimitStore(database);
    await store.hit("k", 0, 60_000);
    const { unsafeRawDb } = await import("@dueproof/db/internal");
    const { sql, rowsOf } = await import("@dueproof/db");
    const rows = rowsOf<{ key: string }>(
      await unsafeRawDb(database).execute(sql`select key from ops.rate_limits`),
    );
    expect(rows.some((r) => r.key.includes("user-1"))).toBe(false);
  });

  it("route hook applies the IP, user and org buckets", async () => {
    const mem = new MemoryRateLimitStore();
    const db2 = await createDatabase({ driver: "pglite" });
    setRateLimitStore(db2, mem);
    const c2 = {
      env: parseEnv({ NODE_ENV: "test", AUTH_SECRET: SECRET, RATE_LIMITS: "upload.org=2/1h" }),
      database: db2,
    } as unknown as Container;
    const req = new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.1" } });
    const ctx = { userId: "u", orgId: "o", container: c2 };
    await limitRequest(req, "upload", ctx);
    await limitRequest(req, "upload", { ...ctx, userId: "u2" });
    await expect(limitRequest(req, "upload", { ...ctx, userId: "u3" })).rejects.toMatchObject({
      rule: "upload.org",
    });
    await db2.close();
  });

  it("is off with RATE_LIMIT_ENABLED=0", async () => {
    const off = {
      env: parseEnv({
        AUTH_SECRET: SECRET,
        RATE_LIMIT_ENABLED: "0",
        RATE_LIMITS: "search.user=1/1m",
      }),
      database,
    } as unknown as Container;
    for (let i = 0; i < 5; i++) await enforce(off, "search.user", "u");
  });

  it("locks an account after repeated failed sign-ins, before the password is checked", async () => {
    let calls = 0;
    const handle = async () => {
      calls++;
      return new Response("{}", { status: 401 });
    };
    const signIn = () =>
      limitAuth(
        c,
        new Request("http://app/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
          body: JSON.stringify({ email: "Asha@Harbour.test", password: "wrong" }),
        }),
        handle,
      );
    expect((await signIn()).status).toBe(401);
    expect((await signIn()).status).toBe(401);
    const third = await signIn();
    expect(third.status).toBe(429);
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(calls).toBe(2);

    // Other auth routes pass straight through.
    const other = await limitAuth(
      c,
      new Request("http://app/api/auth/get-session", { method: "POST" }),
      async () => new Response("ok"),
    );
    expect(other.status).toBe(200);
  });
});

// ---------------------------------------------------------------- diagnostics

describe("health and metrics", () => {
  let database: Database;
  let c: Container;

  beforeAll(async () => {
    database = await createDatabase({ driver: "pglite" });
    await migrate(database);
    c = {
      env: parseEnv({
        NODE_ENV: "test",
        AUTH_SECRET: SECRET,
        ENGINE_URL: "http://engine:8000",
        ENGINE_SHARED_SECRET: "y".repeat(40),
        DUEPROOF_VERSION: "0.1.0-test",
      }),
      database,
    } as unknown as Container;
  });
  afterAll(async () => {
    await database.close();
  });

  const engineUp: typeof fetch = async (url) => {
    expect(String(url)).toBe("http://engine:8000/health");
    return Response.json({
      status: "ok",
      rungs: { text_layer: true, paddleocr: true, tesseract: false },
      translation: "none",
      auth: "on",
    });
  };
  const engineDown: typeof fetch = async () => {
    throw new TypeError("fetch failed");
  };

  it("reports database and engine, with no secrets", async () => {
    const h = await health(c, engineUp);
    expect(h).toMatchObject({
      status: "ok",
      version: "0.1.0-test",
      edition: "self-hosted",
      checks: {
        database: { ok: true },
        engine: { ok: true, rungs: { tesseract: false }, translation: false },
      },
    });
    const text = JSON.stringify(h);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("y".repeat(40));
    expect(text).not.toContain("auth");
  });

  it("is degraded, not down, when only the engine is unreachable", async () => {
    expect((await health(c, engineDown)).status).toBe("degraded");
    expect(await checkEngine(c.env, engineDown)).toMatchObject({ ok: false, error: "unreachable" });
  });

  it("serves Prometheus text", async () => {
    const text = await metrics(c, engineUp);
    expect(text).toContain('dueproof_info{version="0.1.0-test",edition="self-hosted"} 1');
    expect(text).toContain('dueproof_up{part="database"} 1');
    expect(text).toContain("# TYPE process_resident_memory_bytes gauge");
  });

  it("answers metrics only locally or with the token", () => {
    const local = new Request("http://app:3000/api/metrics");
    const viaProxy = new Request("http://app:3000/api/metrics", {
      headers: { "x-forwarded-for": "203.0.113.5" },
    });
    expect(metricsAllowed(local, c.env)).toBe(true);
    expect(metricsAllowed(viaProxy, c.env)).toBe(false);
    // The Next.js server itself fills x-forwarded-for with the socket address.
    const loopback = new Request("http://127.0.0.1:3000/api/metrics", {
      headers: { "x-forwarded-for": "::ffff:127.0.0.1" },
    });
    expect(metricsAllowed(loopback, c.env)).toBe(true);
    const spoofed = new Request("http://x", {
      headers: { "x-forwarded-for": "127.0.0.1, 203.0.113.5" },
    });
    expect(metricsAllowed(spoofed, c.env)).toBe(false);
    const vercel = new Request("http://x", {
      headers: { "x-forwarded-for": "127.0.0.1", "x-vercel-id": "bom1::abc" },
    });
    expect(metricsAllowed(vercel, c.env)).toBe(false);

    const withToken = { ...c.env, METRICS_TOKEN: "m".repeat(40) };
    expect(metricsAllowed(local, withToken)).toBe(false);
    const good = new Request("http://x", {
      headers: { authorization: `Bearer ${"m".repeat(40)}`, "x-forwarded-for": "1.2.3.4" },
    });
    expect(metricsAllowed(good, withToken)).toBe(true);
    const bad = new Request("http://x", { headers: { authorization: "Bearer nope" } });
    expect(metricsAllowed(bad, withToken)).toBe(false);
  });
});
