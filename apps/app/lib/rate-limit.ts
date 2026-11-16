/**
 * Rate limits (05 §3a), backed by Postgres so they hold across processes and
 * instances on every edition (self-hosted Postgres, Neon, PGlite on the
 * desktop). Sliding windows, approximated from two fixed ones: a counter row
 * per key and window, bumped with an upsert. Hosted also has Vercel Firewall rules at the edge; this is the
 * layer both editions share.
 *
 *   await enforce(c, "upload.user", ctx.userId);           // throws 429
 *   await limitRequest(request, "upload", { userId, orgId }); // every bucket for a route kind
 *
 * Keys are hashed (no IPs or email addresses are stored). Limits can be
 * changed with RATE_LIMITS="upload.user=100/1h,search.user=60/1m" and turned
 * off with RATE_LIMIT_ENABLED=0.
 */
import "server-only";
import { createHash } from "node:crypto";
import { type Database, rowsOf, sql } from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import type { Env } from "./env";
import { HttpError } from "./errors";
import type { Container } from "./server/container";

export interface Rule {
  limit: number;
  windowMs: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Starting values from 05 §3a; tuned in the beta. */
export const DEFAULT_RULES = {
  /** Sign-in attempts per IP. */
  "auth.ip": { limit: 20, windowMs: 15 * MIN },
  /** Failed sign-ins per account (checked before, counted after a failure). */
  "auth.account": { limit: 5, windowMs: 15 * MIN },
  /** Sign-ups per IP (hosted: 3/h; self-hosted sign-up is invitation-only anyway). */
  "signup.ip": { limit: 3, windowMs: HOUR },
  "upload.ip": { limit: 300, windowMs: HOUR },
  "upload.user": { limit: 200, windowMs: HOUR },
  "upload.org": { limit: 500, windowMs: HOUR },
  "search.user": { limit: 30, windowMs: MIN },
  "export.user": { limit: 10, windowMs: HOUR },
  "ai.org": { limit: 60, windowMs: MIN },
  "api.token": { limit: 600, windowMs: MIN },
} satisfies Record<string, Rule>;

export type RuleName = keyof typeof DEFAULT_RULES;

const UNITS: Record<string, number> = { s: 1000, m: MIN, h: HOUR, d: 24 * HOUR };

/** Parse RATE_LIMITS overrides: "name=count/window" pairs, window like 30s, 15m, 1h, 1d. */
export function parseOverrides(text: string | undefined): Partial<Record<RuleName, Rule>> {
  const out: Partial<Record<RuleName, Rule>> = {};
  for (const part of (text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = part.match(/^([a-z]+\.[a-z]+)=(\d+)\/(\d+)([smhd])$/);
    if (!m || !((m[1] as string) in DEFAULT_RULES)) {
      throw new Error(`RATE_LIMITS: can't read "${part}" (expected e.g. upload.user=100/1h)`);
    }
    out[m[1] as RuleName] = {
      limit: Number(m[2]),
      windowMs: Number(m[3]) * (UNITS[m[4] as string] as number),
    };
  }
  return out;
}

export function rulesFor(
  env: Pick<Env, "RATE_LIMITS" | "DUEPROOF_EDITION">,
): Record<RuleName, Rule> {
  const base: Record<RuleName, Rule> = { ...DEFAULT_RULES };
  if (env.DUEPROOF_EDITION !== "hosted") base["signup.ip"] = { limit: 20, windowMs: HOUR };
  return { ...base, ...parseOverrides(env.RATE_LIMITS) };
}

// ---------------------------------------------------------------- stores

export interface RateLimitStore {
  /** Count one hit in the window that contains `now`; returns the window's count after it. */
  hit(key: string, windowStart: number, windowMs: number): Promise<number>;
  /** The window's count without adding to it. */
  peek(key: string, windowStart: number): Promise<number>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly counts = new Map<string, number>();
  async hit(key: string, windowStart: number): Promise<number> {
    const k = `${key}@${windowStart}`;
    const n = (this.counts.get(k) ?? 0) + 1;
    this.counts.set(k, n);
    return n;
  }
  async peek(key: string, windowStart: number): Promise<number> {
    return this.counts.get(`${key}@${windowStart}`) ?? 0;
  }
}

/**
 * Counters in `ops.rate_limits`, an UNLOGGED table outside the tenant
 * schema (no RLS: it holds hashed keys and counts, nothing about a tenant).
 * Created on first use, under an advisory lock so concurrent starts don't race.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  private ready: Promise<void> | undefined;
  constructor(private readonly database: Database) {}

  private ensure(): Promise<void> {
    this.ready ??= unsafeRawDb(this.database)
      .transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${0x726c_696d_6974})`);
        await tx.execute(sql`create schema if not exists ops`);
        await tx.execute(sql`
          create unlogged table if not exists ops.rate_limits (
            key text not null,
            window_start bigint not null,
            count integer not null,
            expires_at timestamptz not null,
            primary key (key, window_start)
          )`);
        await tx.execute(
          sql`create index if not exists rate_limits_expires on ops.rate_limits (expires_at)`,
        );
      })
      .then(() => undefined)
      .catch((e) => {
        this.ready = undefined;
        throw e;
      });
    return this.ready;
  }

  async hit(key: string, windowStart: number, windowMs: number): Promise<number> {
    await this.ensure();
    const db = unsafeRawDb(this.database);
    const expires = new Date(windowStart + 2 * windowMs).toISOString();
    const [row] = rowsOf<{ count: number }>(
      await db.execute(sql`
        insert into ops.rate_limits (key, window_start, count, expires_at)
        values (${key}, ${windowStart}, 1, ${expires})
        on conflict (key, window_start) do update set count = ops.rate_limits.count + 1
        returning count`),
    );
    // Now and then, drop windows that have ended.
    if (Math.random() < 0.01) {
      await db.execute(sql`delete from ops.rate_limits where expires_at < now()`).catch(() => {});
    }
    return Number(row?.count ?? 1);
  }

  async peek(key: string, windowStart: number): Promise<number> {
    await this.ensure();
    const [row] = rowsOf<{ count: number }>(
      await unsafeRawDb(this.database).execute(
        sql`select count from ops.rate_limits where key = ${key} and window_start = ${windowStart}`,
      ),
    );
    return Number(row?.count ?? 0);
  }
}

const STORES = Symbol.for("dueproof.rate-limit.stores");
const COUNTERS = Symbol.for("dueproof.rate-limit.counters");
type Holder = {
  [STORES]?: WeakMap<Database, RateLimitStore>;
  [COUNTERS]?: Map<string, number>;
};
const g = globalThis as Holder;

function storeFor(c: Container): RateLimitStore {
  g[STORES] ??= new WeakMap();
  let s = g[STORES].get(c.database);
  if (!s) {
    s = new PostgresRateLimitStore(c.database);
    g[STORES].set(c.database, s);
  }
  return s;
}

/** For tests: use another store for a database. */
export function setRateLimitStore(database: Database, store: RateLimitStore): void {
  g[STORES] ??= new WeakMap();
  g[STORES].set(database, store);
}

/** Refusals per rule since the process started (for /api/metrics). */
export function rateLimitCounters(): Map<string, number> {
  g[COUNTERS] ??= new Map();
  return g[COUNTERS];
}

// ---------------------------------------------------------------- enforcing

export class RateLimitedError extends HttpError {
  override name = "RateLimitedError";
  constructor(
    readonly rule: RuleName,
    readonly retryAfterSeconds: number,
  ) {
    super(429, "Too many requests. Please wait a moment and try again.", "rate_limited");
  }
}

function keyFor(rule: RuleName, subject: string): string {
  return `${rule}:${createHash("sha256").update(subject).digest("base64url").slice(0, 32)}`;
}

function windowOf(rule: Rule, now: number) {
  const start = Math.floor(now / rule.windowMs) * rule.windowMs;
  return { start, retryAfter: Math.max(1, Math.ceil((start + rule.windowMs - now) / 1000)) };
}

function refuse(rule: RuleName, retryAfter: number): never {
  const counters = rateLimitCounters();
  counters.set(rule, (counters.get(rule) ?? 0) + 1);
  throw new RateLimitedError(rule, retryAfter);
}

export interface EnforceOptions {
  now?: number;
  /** Check without counting (for "failures per account": count only after a failure). */
  peekOnly?: boolean;
}

/** Count a hit against `rule` for `subject`; throws RateLimitedError (429) over the limit. */
export async function enforce(
  c: Container,
  ruleName: RuleName,
  subject: string,
  options: EnforceOptions = {},
): Promise<void> {
  if (!c.env.RATE_LIMIT_ENABLED) return;
  const rule = rulesFor(c.env)[ruleName];
  const now = options.now ?? Date.now();
  const { start, retryAfter } = windowOf(rule, now);
  const store = storeFor(c);
  const key = keyFor(ruleName, subject);
  // Sliding window, approximated: the previous window's count, weighted by how
  // much of it still overlaps the last `windowMs`, so a burst can't straddle
  // a window boundary to get twice the limit.
  const overlap = 1 - (now - start) / rule.windowMs;
  const carried = Math.floor((await store.peek(key, start - rule.windowMs)) * overlap);
  if (options.peekOnly) {
    if ((await store.peek(key, start)) + carried >= rule.limit) refuse(ruleName, retryAfter);
    return;
  }
  if ((await store.hit(key, start, rule.windowMs)) + carried > rule.limit) {
    refuse(ruleName, retryAfter);
  }
}

/** Count a hit without enforcing (e.g. a failed sign-in, checked by the next attempt). */
export async function record(c: Container, ruleName: RuleName, subject: string, now = Date.now()) {
  if (!c.env.RATE_LIMIT_ENABLED) return;
  const rule = rulesFor(c.env)[ruleName];
  await storeFor(c).hit(keyFor(ruleName, subject), windowOf(rule, now).start, rule.windowMs);
}

/** The client's IP as our own reverse proxy reports it (AUTH_IP_HEADER), else "unknown". */
export function clientIp(request: Request, env: Pick<Env, "AUTH_IP_HEADER">): string {
  const header = env.AUTH_IP_HEADER ?? "x-forwarded-for";
  const raw = request.headers.get(header) ?? request.headers.get("x-real-ip") ?? "";
  // Our proxy (Caddy, Vercel) puts the client first; anything after is hops.
  return raw.split(",")[0]?.trim() || "unknown";
}

export type RouteKind = "upload" | "search" | "export";

const KIND_RULES: Record<RouteKind, { ip?: RuleName; user?: RuleName; org?: RuleName }> = {
  upload: { ip: "upload.ip", user: "upload.user", org: "upload.org" },
  search: { user: "search.user" },
  export: { user: "export.user" },
};

/**
 * Hook for route handlers and server actions, after authorize():
 *   await limitRequest(request, "upload", ctx);
 * Applies the kind's per-IP, per-user and per-org buckets.
 */
export async function limitRequest(
  request: Request | Headers,
  kind: RouteKind,
  ctx: { userId: string; orgId: string; container: Container },
): Promise<void> {
  const c = ctx.container;
  const rules = KIND_RULES[kind];
  const req =
    request instanceof Request ? request : new Request("http://local", { headers: request });
  if (rules.ip) await enforce(c, rules.ip, clientIp(req, c.env));
  if (rules.user) await enforce(c, rules.user, ctx.userId);
  if (rules.org) await enforce(c, rules.org, ctx.orgId);
}

// ---------------------------------------------------------------- auth

const SIGN_IN = /\/sign-in\/(email|username)$/;
const SIGN_UP = /\/sign-up\/email$/;

/**
 * Wraps Better Auth's POST handler: per-IP limits on sign-in and sign-up, and
 * at most 5 failed sign-ins per account per 15 minutes (05 §3a).
 */
export async function limitAuth(
  c: Container,
  request: Request,
  handle: (request: Request) => Promise<Response>,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const signIn = SIGN_IN.test(path);
  const signUp = SIGN_UP.test(path);
  if (!c.env.RATE_LIMIT_ENABLED || (!signIn && !signUp)) return handle(request);

  const ip = clientIp(request, c.env);
  let account: string | undefined;
  try {
    if (signUp) await enforce(c, "signup.ip", ip);
    if (signIn) {
      await enforce(c, "auth.ip", ip);
      const body = (await request
        .clone()
        .json()
        .catch(() => ({}))) as { email?: unknown; username?: unknown };
      const id = typeof body.email === "string" ? body.email : body.username;
      if (typeof id === "string" && id) {
        account = id.trim().toLowerCase();
        await enforce(c, "auth.account", account, { peekOnly: true });
      }
    }
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return Response.json(
        { error: e.code, message: e.message },
        { status: 429, headers: { "retry-after": String(e.retryAfterSeconds) } },
      );
    }
    throw e;
  }

  const res = await handle(request);
  if (account && (res.status === 401 || res.status === 403)) {
    await record(c, "auth.account", account).catch(() => {});
  }
  return res;
}
