/**
 * engine-heavy on Vercel Sandbox (hosted only, 03 §3a, 05 §4).
 *
 * The full engine (Tesseract, OpenCV, IndicTrans2) is too big for a Vercel
 * Function, so it lives in a Sandbox snapshot built by
 * infra/sandbox/build-snapshot.ts. For a batch of jobs we:
 *
 *   1. start a microVM from the snapshot, with a network policy that
 *      allows only the storage host (R2): deny-all for everything else;
 *   2. write the job requests and a small Python driver into it;
 *   3. run the driver once: it calls the engine's own FastAPI app
 *      in-process (the same /v1/read and /v1/translate handlers and
 *      contract as the HTTP service), one job after another;
 *   4. read the JSON answers back and validate them against the contract;
 *   5. stop the microVM, whatever happened.
 *
 * Files never pass through here: the engine reads and writes storage with
 * the short-lived signed URLs in each request. The microVM holds no secret
 * of ours: the engine's bearer secret inside it is random per batch.
 *
 * Self-hosted and desktop don't use this: their engine container or
 * sidecar already has the whole ladder.
 */
import "server-only";
import { engine } from "@dueproof/contracts";
import {
  EngineError,
  type ReadRequest,
  type ReadResponse,
  type TranslateRequest,
  type TranslateResponse,
} from "@dueproof/engine-client";

/** The slice of @vercel/sandbox's Sandbox this module uses (tests pass a fake). */
export interface SandboxHandle {
  writeFiles(files: { path: string; content: string | Uint8Array }[]): Promise<void>;
  runCommand(params: {
    cmd: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<{ exitCode: number | null; stderr(): Promise<string> }>;
  readFileToBuffer(file: { path: string }): Promise<Uint8Array | null>;
  stop(): Promise<unknown>;
}

export type SandboxCreateParams = {
  source: { type: "snapshot"; snapshotId: string };
  region: string;
  resources: { vcpus: number };
  timeout: number;
  networkPolicy: "deny-all" | { allow: string[] };
  env: Record<string, string>;
  tags: Record<string, string>;
};

export interface SandboxFactory {
  create(params: SandboxCreateParams): Promise<SandboxHandle>;
}

export interface HeavyEngineOptions {
  snapshotId: string;
  region: string;
  vcpus: number;
  /** Sandbox lifetime cap, ms. */
  timeoutMs: number;
  /** Hosts the microVM may reach: the storage host(s), nothing else. */
  allowedHosts: string[];
  /** Defaults to @vercel/sandbox (OIDC credentials on Vercel). */
  sandbox?: SandboxFactory;
}

export type HeavyJob =
  | { endpoint: "read"; request: ReadRequest }
  | { endpoint: "translate"; request: TranslateRequest };

export type HeavyResult<J extends HeavyJob = HeavyJob> = J extends { endpoint: "read" }
  ? ReadResponse
  : TranslateResponse;

/** Where the snapshot puts things (infra/sandbox/build-snapshot.ts). */
export const SNAPSHOT_LAYOUT = {
  python: "/opt/engine/bin/python",
  engineRoot: "/opt/dueproof-engine",
  models: "/opt/models",
  work: "/tmp/dueproof",
} as const;

/**
 * Runs inside the microVM: calls the engine's FastAPI app in-process (no
 * port is opened) with a token signed by a per-batch random secret, and
 * writes each answer to a file. Exit code 0 always; per-job HTTP statuses
 * go to status.json so one bad document doesn't hide the others' results.
 */
export const DRIVER_PY = `
import json, os, sys
from fastapi.testclient import TestClient
from dueproof_engine.app import app
from dueproof_engine.api.auth import make_token

work = sys.argv[1]
with open(os.path.join(work, "jobs.json")) as f:
    jobs = json.load(f)
client = TestClient(app, raise_server_exceptions=False)
statuses = []
for job in jobs:
    with open(os.path.join(work, job["request"]), "rb") as f:
        body = f.read()
    token = make_token(os.environ["ENGINE_SHARED_SECRET"], ttl=600)
    r = client.post("/v1/" + job["endpoint"], content=body,
                    headers={"authorization": "Bearer " + token, "content-type": "application/json"})
    with open(os.path.join(work, job["response"]), "wb") as f:
        f.write(r.content)
    statuses.append(r.status_code)
with open(os.path.join(work, "status.json"), "w") as f:
    json.dump(statuses, f)
`;

function randomSecret(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function defaultFactory(): Promise<SandboxFactory> {
  const { Sandbox } = await import("@vercel/sandbox");
  return {
    create: async (params) => (await Sandbox.create(params)) as unknown as SandboxHandle,
  };
}

const decoder = new TextDecoder();

/**
 * Run jobs in one microVM and return their answers in order. Throws
 * EngineError: retryable when the Sandbox couldn't start or run (the
 * workflow step retries), not retryable when the engine refused a job
 * (bad document, contract break).
 */
export async function runHeavyBatch<const J extends readonly HeavyJob[]>(
  options: HeavyEngineOptions,
  jobs: J,
): Promise<{ [K in keyof J]: HeavyResult<J[K]> }> {
  if (!jobs.length) return [] as unknown as { [K in keyof J]: HeavyResult<J[K]> };
  const factory = options.sandbox ?? (await defaultFactory());
  const hosts = [...new Set(options.allowedHosts.map((h) => h.trim()).filter(Boolean))];
  const work = SNAPSHOT_LAYOUT.work;

  let sandbox: SandboxHandle;
  try {
    sandbox = await factory.create({
      source: { type: "snapshot", snapshotId: options.snapshotId },
      region: options.region,
      resources: { vcpus: options.vcpus },
      timeout: options.timeoutMs,
      networkPolicy: hosts.length ? { allow: hosts } : "deny-all",
      env: {
        ENGINE_SHARED_SECRET: randomSecret(),
        PYTHONPATH: SNAPSHOT_LAYOUT.engineRoot,
        DUEPROOF_MODELS: SNAPSHOT_LAYOUT.models,
        DUEPROOF_LANGUAGES: "all",
        // The engine's own allowlist, on top of the Sandbox network policy.
        ...(hosts.length ? { DUEPROOF_ALLOWED_HOSTS: hosts.join(",") } : {}),
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
      },
      tags: { app: "dueproof", part: "engine-heavy" },
    });
  } catch (e) {
    throw new EngineError(
      `engine-heavy sandbox did not start: ${(e as Error)?.name ?? "error"}`,
      jobs[0]?.endpoint ?? "read",
      undefined,
      true,
    );
  }

  try {
    const manifest = jobs.map((j, i) => ({
      endpoint: j.endpoint,
      request: `req-${i}.json`,
      response: `res-${i}.json`,
    }));
    await sandbox.writeFiles([
      { path: `${work}/driver.py`, content: DRIVER_PY },
      { path: `${work}/jobs.json`, content: JSON.stringify(manifest) },
      ...jobs.map((j, i) => ({
        path: `${work}/req-${i}.json`,
        content: JSON.stringify(j.request),
      })),
    ]);

    const run = await sandbox.runCommand({
      cmd: SNAPSHOT_LAYOUT.python,
      args: [`${work}/driver.py`, work],
      cwd: SNAPSHOT_LAYOUT.engineRoot,
      timeoutMs: Math.max(60_000, options.timeoutMs - 60_000),
    });
    if (run.exitCode !== 0) {
      // stderr can quote document text: keep only its length for diagnosis.
      const err = await run.stderr().catch(() => "");
      throw new EngineError(
        `engine-heavy driver exited with ${run.exitCode} (${err.length} bytes of stderr)`,
        jobs[0]?.endpoint ?? "read",
        undefined,
        true,
      );
    }

    const statusRaw = await sandbox.readFileToBuffer({ path: `${work}/status.json` });
    const statuses = statusRaw ? (JSON.parse(decoder.decode(statusRaw)) as number[]) : [];
    const out: unknown[] = [];
    for (const [i, job] of jobs.entries()) {
      const status = statuses[i];
      if (status !== 200) {
        throw new EngineError(
          `engine-heavy ${job.endpoint} failed with ${status ?? "no answer"}`,
          job.endpoint,
          status,
          status === undefined || status >= 500 || status === 429,
        );
      }
      const raw = await sandbox.readFileToBuffer({ path: `${work}/res-${i}.json` });
      let json: unknown;
      try {
        json = JSON.parse(decoder.decode(raw ?? new Uint8Array()));
      } catch {
        throw new EngineError(
          `engine-heavy ${job.endpoint} returned invalid JSON`,
          job.endpoint,
          200,
          true,
        );
      }
      const schema = job.endpoint === "read" ? engine.ReadResponse : engine.TranslateResponse;
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new EngineError(
          `engine-heavy ${job.endpoint} response broke the contract: ${parsed.error.message}`,
          job.endpoint,
        );
      }
      out.push(parsed.data);
    }
    return out as { [K in keyof J]: HeavyResult<J[K]> };
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

/** engine-heavy as the workflow sees it: one microVM per call. */
export interface HeavyEngine {
  read(req: ReadRequest): Promise<ReadResponse>;
  translate(req: TranslateRequest): Promise<TranslateResponse>;
}

export function createHeavyEngine(options: HeavyEngineOptions): HeavyEngine {
  return {
    read: async (request) => {
      const [res] = await runHeavyBatch(options, [{ endpoint: "read", request }] as const);
      return res;
    },
    translate: async (request) => {
      const [res] = await runHeavyBatch(options, [{ endpoint: "translate", request }] as const);
      return res;
    },
  };
}
