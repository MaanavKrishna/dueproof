/**
 * Server singletons: database, auth, storage, engine and the pipeline
 * runner. Kept on globalThis because Next.js may load a module more than
 * once (route bundles, dev reloads) and PGlite allows one instance per data
 * directory. Tests replace the whole container with `setContainer()`.
 */
import "server-only";
import { resolve } from "node:path";
import { type Auth, createAuth } from "@dueproof/auth";
import { createDatabase, type Database, migrate } from "@dueproof/db";
import { createEngineClient, createFakeEngine, type EngineClient } from "@dueproof/engine-client";
import {
  createStorage,
  LocalDiskStorage,
  MemoryStorage,
  type StoragePort,
} from "@dueproof/storage";
import { type Env, getEnv } from "../env";
import { createHeavyEngine, type HeavyEngine } from "../heavy-engine";
import type { DocumentRef } from "../pipeline/types";
import { storageHosts } from "../security/headers";

export interface Container {
  env: Env;
  database: Database;
  auth: Auth;
  /** Signed URLs for browsers. */
  storage: StoragePort;
  /** Signed URLs for the engine (may use an internal base URL). */
  engineStorage: StoragePort;
  engine: EngineClient;
  /**
   * engine-heavy in Vercel Sandbox (hosted with HEAVY_ENGINE_SNAPSHOT_ID): the
   * escalation path for pages engine-fast can't read, and offline translation.
   * Absent elsewhere: the self-hosted engine container has the whole ladder.
   */
  heavyEngine?: HeavyEngine;
  /** Starts processDocument for a stored document; returns a run id. */
  startPipeline: (ref: DocumentRef) => Promise<string>;
}

const KEY = Symbol.for("dueproof.container");
type Holder = { [KEY]?: Promise<Container> | undefined };

export function getContainer(): Promise<Container> {
  const g = globalThis as Holder;
  g[KEY] ??= build(getEnv()).catch((e) => {
    g[KEY] = undefined;
    throw e;
  });
  return g[KEY] as Promise<Container>;
}

/** For tests and the desktop shell: install a ready-made container. */
export function setContainer(container: Container | undefined): void {
  (globalThis as Holder)[KEY] = container ? Promise.resolve(container) : undefined;
}

function readerFor(
  storage: StoragePort,
): ((url: string) => Promise<Uint8Array | null>) | undefined {
  if (storage instanceof LocalDiskStorage || storage instanceof MemoryStorage) {
    return (url) => storage.readSignedUrl(url);
  }
  return undefined;
}

function writerFor(storage: StoragePort) {
  if (storage instanceof LocalDiskStorage || storage instanceof MemoryStorage) {
    return (url: string, body: Uint8Array, contentType: string) =>
      storage.writeSignedUrl(url, body, contentType);
  }
  return undefined;
}

export function createEngine(env: Env, engineStorage: StoragePort): EngineClient {
  if (env.ENGINE_MODE === "http") {
    return createEngineClient({
      baseUrl: env.ENGINE_URL as string,
      secret: env.ENGINE_SHARED_SECRET as string,
    });
  }
  const read = readerFor(engineStorage);
  const write = writerFor(engineStorage);
  return createFakeEngine({
    fetchSource:
      read ??
      (async (url) => {
        const res = await fetch(url);
        return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
      }),
    putObject:
      write ??
      ((url, body, contentType) =>
        fetch(url, {
          method: "PUT",
          headers: { "content-type": contentType },
          body: body as BodyInit,
        })),
  });
}

export function createHeavy(env: Env): HeavyEngine | undefined {
  if (env.DUEPROOF_EDITION !== "hosted" || !env.HEAVY_ENGINE_SNAPSHOT_ID) return undefined;
  return createHeavyEngine({
    snapshotId: env.HEAVY_ENGINE_SNAPSHOT_ID,
    region: env.HEAVY_ENGINE_REGION,
    vcpus: env.HEAVY_ENGINE_VCPUS,
    timeoutMs: env.HEAVY_ENGINE_TIMEOUT_MS,
    allowedHosts: env.HEAVY_ENGINE_ALLOWED_HOSTS?.split(",") ?? storageHosts(env),
  });
}

function storagePair(env: Env): { storage: StoragePort; engineStorage: StoragePort } {
  switch (env.STORAGE_DRIVER) {
    case "local": {
      const common = {
        root: resolve(env.STORAGE_LOCAL_DIR),
        secret: env.STORAGE_SIGNING_SECRET,
        maxPutBytes: env.UPLOAD_MAX_BYTES,
      };
      const route = "/api/storage/local";
      const storage = new LocalDiskStorage({
        ...common,
        publicUrl: new URL(route, env.APP_URL).toString(),
      });
      const engineStorage = env.STORAGE_ENGINE_BASE_URL
        ? new LocalDiskStorage({
            ...common,
            publicUrl: new URL(route, env.STORAGE_ENGINE_BASE_URL).toString(),
          })
        : storage;
      return { storage, engineStorage };
    }
    case "s3": {
      const s = createStorage({
        driver: "s3",
        bucket: env.S3_BUCKET as string,
        ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
        region: env.S3_REGION,
        accessKeyId: env.S3_ACCESS_KEY_ID as string,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      });
      return { storage: s, engineStorage: s };
    }
    case "vercel-blob": {
      const s = createStorage({
        driver: "vercel-blob",
        token: env.BLOB_READ_WRITE_TOKEN as string,
      });
      return { storage: s, engineStorage: s };
    }
  }
}

async function build(env: Env): Promise<Container> {
  const database = await createDatabase(
    env.DATABASE_DRIVER === "pglite"
      ? { driver: "pglite", dataDir: resolve(env.PGLITE_DATA_DIR) }
      : { driver: env.DATABASE_DRIVER, url: env.DATABASE_URL as string },
  );
  if (env.DB_MIGRATE_ON_START) await migrate(database);

  const auth = createAuth({
    database,
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,
    signupPolicy: env.AUTH_SIGNUP,
    trustedOrigins:
      env.AUTH_TRUSTED_ORIGINS?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [],
    ...(env.AUTH_IP_HEADER ? { ipAddressHeaders: [env.AUTH_IP_HEADER] } : {}),
  });

  const { storage, engineStorage } = storagePair(env);
  const engine = createEngine(env, engineStorage);
  const heavyEngine = createHeavy(env);

  return {
    env,
    database,
    auth,
    storage,
    engineStorage,
    engine,
    ...(heavyEngine ? { heavyEngine } : {}),
    startPipeline: async (ref) => {
      const [{ start }, { processDocument }] = await Promise.all([
        import("workflow/api"),
        import("../../workflows/process-document"),
      ]);
      const run = await start(processDocument, [ref]);
      return run.runId;
    },
  };
}
