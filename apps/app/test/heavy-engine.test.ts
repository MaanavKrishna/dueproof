/**
 * engine-heavy orchestration (lib/heavy-engine.ts) against a mocked Sandbox
 * client: the microVM is started from the snapshot with storage-only
 * network, the driver and requests go in, answers come out validated, and
 * the microVM is stopped on every path. Then the escalate stage merges a
 * better reading into the pages table.
 */
import {
  createDatabase,
  type Database,
  documents,
  migrate,
  pages,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { EngineError } from "@dueproof/engine-client";
import { MemoryStorage } from "@dueproof/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "../lib/env";
import {
  createHeavyEngine,
  DRIVER_PY,
  type HeavyEngineOptions,
  runHeavyBatch,
  type SandboxCreateParams,
  type SandboxFactory,
  type SandboxHandle,
} from "../lib/heavy-engine";
import { escalateStage } from "../lib/pipeline/stages";
import { type Container, createHeavy } from "../lib/server/container";

const enc = new TextEncoder();

const page = (n: number, confidence: number, text: string, engine = "tesseract") => ({
  page: n,
  width: 595,
  height: 842,
  rotation: 0,
  text,
  words: text
    ? [{ text, rect: [10, 10, 100, 20] as [number, number, number, number], line: 0 }]
    : [],
  engine,
  confidence,
  languages: ["hi"],
});

interface FakeRun {
  created: SandboxCreateParams[];
  files: Map<string, string>;
  commands: Array<{ cmd: string; args?: string[] }>;
  stopped: number;
}

/** A Sandbox fake that "runs" the driver by answering each job from `answer`. */
function fakeSandbox(
  answer: (endpoint: string, body: unknown) => { status: number; body: unknown },
  opts: { failCreate?: boolean; exitCode?: number } = {},
): { factory: SandboxFactory; run: FakeRun } {
  const run: FakeRun = { created: [], files: new Map(), commands: [], stopped: 0 };
  const handle: SandboxHandle = {
    async writeFiles(files) {
      for (const f of files) {
        run.files.set(
          f.path,
          typeof f.content === "string" ? f.content : new TextDecoder().decode(f.content),
        );
      }
    },
    async runCommand(p) {
      run.commands.push(p);
      if (opts.exitCode) return { exitCode: opts.exitCode, stderr: async () => "boom" };
      const work = p.args?.[1] as string;
      const jobs = JSON.parse(run.files.get(`${work}/jobs.json`) as string) as Array<{
        endpoint: string;
        request: string;
        response: string;
      }>;
      const statuses: number[] = [];
      for (const j of jobs) {
        const res = answer(j.endpoint, JSON.parse(run.files.get(`${work}/${j.request}`) as string));
        run.files.set(`${work}/${j.response}`, JSON.stringify(res.body));
        statuses.push(res.status);
      }
      run.files.set(`${work}/status.json`, JSON.stringify(statuses));
      return { exitCode: 0, stderr: async () => "" };
    },
    async readFileToBuffer({ path }) {
      const v = run.files.get(path);
      return v === undefined ? null : enc.encode(v);
    },
    async stop() {
      run.stopped++;
    },
  };
  return {
    run,
    factory: {
      async create(params) {
        run.created.push(params);
        if (opts.failCreate) throw new Error("quota");
        return handle;
      },
    },
  };
}

const base: Omit<HeavyEngineOptions, "sandbox"> = {
  snapshotId: "snap_heavy_1",
  region: "bom1",
  vcpus: 4,
  timeoutMs: 600_000,
  allowedHosts: ["acct.r2.cloudflarestorage.com"],
};

const readRequest = {
  sourceUrl: "https://acct.r2.cloudflarestorage.com/b/o?sig=1",
  mime: "application/pdf" as const,
  pageImagePutUrls: ["https://acct.r2.cloudflarestorage.com/b/p1?sig=2"],
  languages: ["en", "hi"],
  maxRung: "tesseract" as const,
};

describe("runHeavyBatch", () => {
  it("starts from the snapshot with storage-only network and returns validated answers", async () => {
    const { factory, run } = fakeSandbox((endpoint) =>
      endpoint === "read"
        ? { status: 200, body: { pages: [page(1, 0.93, "नोटिस")], needsEscalation: [] } }
        : {
            status: 200,
            body: {
              segments: [{ id: "1:0", textEn: "Notice", engine: "indictrans2" }],
              engine: "indictrans2",
            },
          },
    );
    const [read, translated] = await runHeavyBatch({ ...base, sandbox: factory }, [
      { endpoint: "read", request: readRequest },
      { endpoint: "translate", request: { segments: [{ id: "1:0", text: "नोटिस", lang: "hi" }] } },
    ] as const);

    expect(read.pages[0]).toMatchObject({ page: 1, engine: "tesseract", confidence: 0.93 });
    expect(translated.segments[0]?.textEn).toBe("Notice");

    expect(run.created).toHaveLength(1);
    const created = run.created[0] as SandboxCreateParams;
    expect(created).toMatchObject({
      source: { type: "snapshot", snapshotId: "snap_heavy_1" },
      region: "bom1",
      resources: { vcpus: 4 },
      timeout: 600_000,
      networkPolicy: { allow: ["acct.r2.cloudflarestorage.com"] },
    });
    // A fresh random secret per batch, never ours; the engine's own host allowlist too.
    expect(created.env.ENGINE_SHARED_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(created.env.DUEPROOF_ALLOWED_HOSTS).toBe("acct.r2.cloudflarestorage.com");
    expect(created.env.HF_HUB_OFFLINE).toBe("1");

    // One driver run for the whole batch, the requests written verbatim.
    expect(run.commands).toHaveLength(1);
    expect(run.files.get("/tmp/dueproof/driver.py")).toBe(DRIVER_PY);
    expect(JSON.parse(run.files.get("/tmp/dueproof/req-0.json") as string)).toEqual(readRequest);
    expect(run.stopped).toBe(1);
  });

  it("denies all network when no host is allowed", async () => {
    const { factory, run } = fakeSandbox(() => ({
      status: 200,
      body: { segments: [], engine: "none" },
    }));
    await runHeavyBatch({ ...base, allowedHosts: [" "], sandbox: factory }, [
      { endpoint: "translate", request: { segments: [] } },
    ] as const);
    expect(run.created[0]?.networkPolicy).toBe("deny-all");
    expect(run.created[0]?.env).not.toHaveProperty("DUEPROOF_ALLOWED_HOSTS");
  });

  it("a refused document is a permanent error, and the microVM still stops", async () => {
    const { factory, run } = fakeSandbox(() => ({
      status: 422,
      body: { error: "unreadable", reason: "corrupt" },
    }));
    const err = await runHeavyBatch({ ...base, sandbox: factory }, [
      { endpoint: "read", request: readRequest },
    ] as const).catch((e) => e);
    expect(err).toBeInstanceOf(EngineError);
    expect(err).toMatchObject({ status: 422, retryable: false });
    expect(run.stopped).toBe(1);
  });

  it("an answer that breaks the contract is refused", async () => {
    const { factory, run } = fakeSandbox(() => ({ status: 200, body: { pages: [{ page: 0 }] } }));
    const err = await runHeavyBatch({ ...base, sandbox: factory }, [
      { endpoint: "read", request: readRequest },
    ] as const).catch((e) => e);
    expect(err).toMatchObject({ name: "EngineError", retryable: false });
    expect(String(err.message)).toContain("broke the contract");
    expect(run.stopped).toBe(1);
  });

  it("a Sandbox that won't start or a driver crash is retryable", async () => {
    const failing = fakeSandbox(() => ({ status: 200, body: {} }), { failCreate: true });
    await expect(
      runHeavyBatch({ ...base, sandbox: failing.factory }, [
        { endpoint: "read", request: readRequest },
      ] as const),
    ).rejects.toMatchObject({ name: "EngineError", retryable: true });
    expect(failing.run.stopped).toBe(0);

    const crash = fakeSandbox(() => ({ status: 200, body: {} }), { exitCode: 137 });
    const err = await runHeavyBatch({ ...base, sandbox: crash.factory }, [
      { endpoint: "read", request: readRequest },
    ] as const).catch((e) => e);
    expect(err).toMatchObject({ retryable: true });
    // stderr may quote the document: only its size is reported.
    expect(String(err.message)).not.toContain("boom");
    expect(crash.run.stopped).toBe(1);
  });
});

describe("createHeavy (container wiring)", () => {
  const common = {
    AUTH_SECRET: "x".repeat(40),
    ENGINE_URL: "https://engine-fast.example",
    ENGINE_SHARED_SECRET: "y".repeat(40),
    STORAGE_DRIVER: "s3",
    S3_BUCKET: "dueproof",
    S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
    S3_ACCESS_KEY_ID: "k",
    S3_SECRET_ACCESS_KEY: "s",
    HEAVY_ENGINE_SNAPSHOT_ID: "snap_1",
  };

  it("is on only for hosted with a snapshot", () => {
    expect(createHeavy(parseEnv({ ...common, DUEPROOF_EDITION: "hosted" }))).toBeDefined();
    expect(createHeavy(parseEnv({ ...common, DUEPROOF_EDITION: "self-hosted" }))).toBeUndefined();
    const { HEAVY_ENGINE_SNAPSHOT_ID: _, ...noSnapshot } = common;
    expect(createHeavy(parseEnv({ ...noSnapshot, DUEPROOF_EDITION: "hosted" }))).toBeUndefined();
  });

  it("needs object storage the Sandbox can reach", () => {
    expect(() =>
      parseEnv({ AUTH_SECRET: "x".repeat(40), HEAVY_ENGINE_SNAPSHOT_ID: "snap_1" }),
    ).toThrow(/HEAVY_ENGINE_SNAPSHOT_ID/);
  });
});

describe("escalateStage", () => {
  let database: Database;
  const orgId = uuidv7();
  const documentId = uuidv7();

  beforeAll(async () => {
    database = await createDatabase({ driver: "pglite" });
    await migrate(database);
    await withOrg(database, orgId, async (tx) => {
      await tx.insert(documents).values({
        id: documentId,
        orgId,
        filename: "notice.pdf",
        mime: "application/pdf",
        sizeBytes: 10,
        sha256: "a".repeat(64),
        storageKey: `org/${orgId}/originals/${"a".repeat(64)}`,
        pageCount: 2,
        languages: ["en"],
      });
      for (const [n, conf] of [
        [1, 1],
        [2, 0.4],
      ] as const) {
        await tx.insert(pages).values({
          orgId,
          documentId,
          page: n,
          width: 595,
          height: 842,
          text: n === 1 ? "digital page" : "n0ise",
          words: [],
          engine: n === 1 ? "text_layer" : "paddleocr",
          confidence: conf,
        });
      }
    });
  });
  afterAll(async () => {
    await database.close();
  });

  it("replaces only escalated pages the heavy engine read better", async () => {
    const env = parseEnv({ NODE_ENV: "test", AUTH_SECRET: "x".repeat(40) });
    const storage = new MemoryStorage();
    const { factory, run } = fakeSandbox(() => ({
      status: 200,
      body: {
        // Page 1 comes back worse: it must not be touched.
        pages: [page(1, 0.5, "worse"), page(2, 0.91, "सूचना")],
        needsEscalation: [],
      },
    }));
    const c = {
      env,
      database,
      storage,
      engineStorage: storage,
      heavyEngine: createHeavyEngine({ ...base, sandbox: factory }),
    } as unknown as Container;

    const out = await escalateStage(
      c,
      { orgId, documentId },
      {
        pageCount: 2,
        languages: ["en"],
        needsTranslation: false,
        needsEscalation: [2],
        canEscalate: true,
      },
    );
    expect(out).toMatchObject({
      needsEscalation: [],
      canEscalate: false,
      needsTranslation: true,
      languages: ["en", "hi"],
    });
    expect(run.created).toHaveLength(1);

    const rows = await withOrg(database, orgId, (tx) => tx.select().from(pages));
    const byPage = new Map(rows.map((r) => [r.page, r]));
    expect(byPage.get(1)).toMatchObject({ text: "digital page", engine: "text_layer" });
    expect(byPage.get(2)).toMatchObject({ text: "सूचना", engine: "tesseract" });
    expect(byPage.get(2)?.confidence).toBeCloseTo(0.91);
  });

  it("does nothing without engine-heavy", async () => {
    const c = { heavyEngine: undefined } as unknown as Container;
    const read = {
      pageCount: 1,
      languages: ["en"],
      needsTranslation: false,
      needsEscalation: [1],
      canEscalate: true,
    };
    expect(await escalateStage(c, { orgId, documentId }, read)).toEqual({
      ...read,
      canEscalate: false,
    });
  });
});
