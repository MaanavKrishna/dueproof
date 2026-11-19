/**
 * Health and metrics (03 §12). Nothing here reads tenant data or returns a
 * secret: reachability and timings of the parts, counts from the workflow
 * queue, and process figures. Used by GET /api/health and GET /api/metrics.
 */
import "server-only";
import { timingSafeEqual } from "node:crypto";
import { rowsOf, sql } from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { signEngineToken } from "@dueproof/engine-client";
import type { Env } from "../env";
import type { Container } from "./container";

export interface Check {
  ok: boolean;
  ms: number;
  /** A short, safe reason ("timeout", "unreachable", "http 503"), never an error message. */
  error?: string;
}

export interface EngineCheck extends Check {
  /** Rungs and translation the engine reports (its /health shows them only to a token holder). */
  rungs?: Record<string, boolean>;
  translation?: boolean;
}

export interface Health {
  status: "ok" | "degraded" | "down";
  version: string;
  edition: Env["DUEPROOF_EDITION"];
  checks: { database: Check; engine: EngineCheck; heavyEngine?: { configured: boolean } };
}

async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; ms: number; value: T } | { ok: false; ms: number; error: string }> {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { ok: true, ms: Math.round(performance.now() - t0), value };
  } catch (e) {
    const name = (e as Error)?.name;
    const error = name === "TimeoutError" || name === "AbortError" ? "timeout" : "unreachable";
    return { ok: false, ms: Math.round(performance.now() - t0), error };
  }
}

export async function checkDatabase(c: Container): Promise<Check> {
  const r = await timed(() =>
    Promise.race([
      unsafeRawDb(c.database).execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error(), { name: "TimeoutError" })), 3000),
      ),
    ]),
  );
  return r.ok ? { ok: true, ms: r.ms } : { ok: false, ms: r.ms, error: r.error };
}

export async function checkEngine(env: Env, doFetch: typeof fetch = fetch): Promise<EngineCheck> {
  if (env.ENGINE_MODE === "fake") return { ok: true, ms: 0, rungs: { fake: true } };
  const url = `${(env.ENGINE_URL as string).replace(/\/+$/, "")}/health`;
  const r = await timed(async () => {
    // Anonymous callers get only {"status": "ok"}; the capabilities need the engine token.
    const headers: Record<string, string> = env.ENGINE_SHARED_SECRET
      ? { authorization: `Bearer ${signEngineToken(env.ENGINE_SHARED_SECRET, { ttlSeconds: 60 })}` }
      : {};
    const res = await doFetch(url, { headers, signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw Object.assign(new Error(), { name: `http ${res.status}` });
    return (await res.json()) as { rungs?: Record<string, boolean>; translation?: string };
  });
  if (!r.ok) return { ok: false, ms: r.ms, error: r.error };
  const body = r.value ?? {};
  const rungs =
    body.rungs && typeof body.rungs === "object"
      ? Object.fromEntries(Object.entries(body.rungs).filter(([, v]) => typeof v === "boolean"))
      : undefined;
  // The engine reports its translator by name ("indictrans2") or "none".
  const translation =
    typeof body.translation === "string" ? body.translation !== "none" : undefined;
  return {
    ok: true,
    ms: r.ms,
    ...(rungs ? { rungs } : {}),
    ...(translation !== undefined ? { translation } : {}),
  };
}

export async function health(c: Container, doFetch: typeof fetch = fetch): Promise<Health> {
  const [database, engine] = await Promise.all([checkDatabase(c), checkEngine(c.env, doFetch)]);
  const status = !database.ok ? "down" : engine.ok ? "ok" : "degraded";
  return {
    status,
    version: c.env.DUEPROOF_VERSION,
    edition: c.env.DUEPROOF_EDITION,
    checks: {
      database,
      engine,
      ...(c.env.DUEPROOF_EDITION === "hosted"
        ? { heavyEngine: { configured: Boolean(c.env.HEAVY_ENGINE_SNAPSHOT_ID) } }
        : {}),
    },
  };
}

// ---------------------------------------------------------------- metrics

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+|localhost)$/i;

/**
 * /api/metrics is for the operator's own Prometheus. With METRICS_TOKEN set
 * it needs `Authorization: Bearer <token>`. A route handler can't see the
 * socket's address, only headers a client can write (X-Forwarded-For), so in
 * production the token is required: without one the endpoint is off
 * (security review I1). In development and tests, requests with no
 * forwarding headers, or only loopback ones, are answered.
 */
export function metricsAllowed(request: Request, env: Env): boolean {
  if (env.METRICS_TOKEN) {
    const got = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
    const a = Buffer.from(got);
    const b = Buffer.from(env.METRICS_TOKEN);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  if (env.NODE_ENV === "production") return false;
  if (request.headers.has("x-vercel-id") || request.headers.has("forwarded")) return false;
  const hops = ["x-forwarded-for", "x-real-ip"].flatMap((h) =>
    (request.headers.get(h) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return hops.every((ip) => LOOPBACK.test(ip));
}

type Sample = {
  name: string;
  help: string;
  type: "gauge" | "counter";
  values: Array<[Record<string, string>, number]>;
};

function render(samples: Sample[]): string {
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const out: string[] = [];
  for (const s of samples) {
    out.push(`# HELP ${s.name} ${s.help}`, `# TYPE ${s.name} ${s.type}`);
    for (const [labels, value] of s.values) {
      const l = Object.entries(labels)
        .map(([k, v]) => `${k}="${esc(v)}"`)
        .join(",");
      out.push(`${s.name}${l ? `{${l}}` : ""} ${Number.isFinite(value) ? value : 0}`);
    }
  }
  return `${out.join("\n")}\n`;
}

/** Workflow run counts by status, when the Postgres World's tables are in this database. */
async function workflowRuns(c: Container): Promise<Array<[Record<string, string>, number]>> {
  try {
    const rows = rowsOf<{ status: string; n: string | number }>(
      await unsafeRawDb(c.database).execute(
        sql`select status::text as status, count(*) as n from workflow.workflow_runs group by status`,
      ),
    );
    return rows.map((r) => [{ status: r.status }, Number(r.n)]);
  } catch {
    return [];
  }
}

export async function metrics(c: Container, doFetch: typeof fetch = fetch): Promise<string> {
  const [h, runs] = await Promise.all([health(c, doFetch), workflowRuns(c)]);
  const mem = process.memoryUsage();
  const { rateLimitCounters } = await import("../rate-limit");
  const samples: Sample[] = [
    {
      name: "dueproof_info",
      help: "Version and edition of this install.",
      type: "gauge",
      values: [[{ version: h.version, edition: h.edition }, 1]],
    },
    {
      name: "dueproof_up",
      help: "Whether a part answers (1) or not (0).",
      type: "gauge",
      values: [
        [{ part: "database" }, h.checks.database.ok ? 1 : 0],
        [{ part: "engine" }, h.checks.engine.ok ? 1 : 0],
      ],
    },
    {
      name: "dueproof_check_seconds",
      help: "How long the last health check of a part took.",
      type: "gauge",
      values: [
        [{ part: "database" }, h.checks.database.ms / 1000],
        [{ part: "engine" }, h.checks.engine.ms / 1000],
      ],
    },
    {
      name: "dueproof_workflow_runs",
      help: "Workflow runs by status (Postgres World only).",
      type: "gauge",
      values: runs,
    },
    {
      name: "dueproof_rate_limited_total",
      help: "Requests refused by a rate limit since the process started.",
      type: "counter",
      values: [...rateLimitCounters()].map(([rule, n]) => [{ rule }, n]),
    },
    {
      name: "process_resident_memory_bytes",
      help: "Resident memory size in bytes.",
      type: "gauge",
      values: [[{}, mem.rss]],
    },
    {
      name: "nodejs_heap_used_bytes",
      help: "V8 heap in use, in bytes.",
      type: "gauge",
      values: [[{}, mem.heapUsed]],
    },
    {
      name: "process_uptime_seconds",
      help: "Seconds since the process started.",
      type: "gauge",
      values: [[{}, Math.round(process.uptime())]],
    },
  ];
  return render(samples);
}
