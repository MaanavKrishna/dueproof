/**
 * One Drizzle client factory for the three Postgres drivers (03 §7):
 *
 *   postgres  postgres-js — self-hosted server, local dev against Docker
 *   neon      @neondatabase/serverless (WebSocket Pool) — hosted
 *   pglite    @electric-sql/pglite — desktop Local mode and tests
 *
 * The returned `Database` is opaque on purpose: tenant data is reached only
 * through `withOrg()` (tenant.ts). The raw handle is kept in a WeakMap and
 * exposed only to packages that need it (auth, migrations) through
 * `@dueproof/db/internal`.
 */
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import * as authTables from "./auth-schema";
import * as tenantTables from "./schema";

export const schema = { ...tenantTables, ...authTables };
export type Schema = typeof schema;

/** Any of the three drivers' Drizzle database, typed with our schema. */
export type AnyPgDatabase = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export type DbDriver = "pglite" | "postgres" | "neon";

export type DbConfig =
  /** `dataDir` unset = in-memory (tests). PGlite takes one connection per process. */
  | { driver: "pglite"; dataDir?: string | undefined }
  | { driver: "postgres"; url: string; max?: number | undefined }
  | { driver: "neon"; url: string; max?: number | undefined };

export interface Database {
  readonly driver: DbDriver;
  /** Role that withOrg() switches to; null disables role switching (see rls.sql). */
  readonly appRole: string | null;
  close(): Promise<void>;
}

interface Internal {
  db: AnyPgDatabase;
  close: () => Promise<void>;
}

// Shared through globalThis: bundlers (Next.js route bundles, dev reloads) can load
// this module more than once, and a Database made by one copy must work in another.
const INTERNALS = Symbol.for("dueproof.db.internals");
const registry = globalThis as { [INTERNALS]?: WeakMap<Database, Internal> };
if (!registry[INTERNALS]) registry[INTERNALS] = new WeakMap<Database, Internal>();
const internals: WeakMap<Database, Internal> = registry[INTERNALS];

export interface CreateDatabaseOptions {
  /** Defaults to "dueproof_app". Set null only where the login role already lacks BYPASSRLS and owns nothing. */
  appRole?: string | null;
}

export async function createDatabase(
  config: DbConfig,
  options: CreateDatabaseOptions = {},
): Promise<Database> {
  let internal: Internal;
  switch (config.driver) {
    case "pglite": {
      const { PGlite } = await import("@electric-sql/pglite");
      const { drizzle } = await import("drizzle-orm/pglite");
      if (config.dataDir && !config.dataDir.includes("://")) {
        // PGlite creates the data directory but not its parents.
        const { mkdir } = await import("node:fs/promises");
        const { dirname } = await import("node:path");
        await mkdir(dirname(config.dataDir), { recursive: true });
      }
      const client = config.dataDir ? new PGlite(config.dataDir) : new PGlite();
      await client.waitReady;
      internal = {
        db: drizzle({ client, schema }) as unknown as AnyPgDatabase,
        close: () => client.close(),
      };
      break;
    }
    case "postgres": {
      const { default: postgres } = await import("postgres");
      const { drizzle } = await import("drizzle-orm/postgres-js");
      const client = postgres(config.url, { max: config.max ?? 10, onnotice: () => {} });
      internal = {
        db: drizzle({ client, schema }) as unknown as AnyPgDatabase,
        close: () => client.end({ timeout: 5 }),
      };
      break;
    }
    case "neon": {
      const { Pool } = await import("@neondatabase/serverless");
      const { drizzle } = await import("drizzle-orm/neon-serverless");
      const client = new Pool({ connectionString: config.url, max: config.max ?? 5 });
      internal = {
        db: drizzle({ client, schema }) as unknown as AnyPgDatabase,
        close: () => client.end(),
      };
      break;
    }
  }
  const database: Database = Object.freeze({
    driver: config.driver,
    appRole: options.appRole === undefined ? "dueproof_app" : options.appRole,
    close: () => internal.close(),
  });
  internals.set(database, internal);
  return database;
}

/** @internal Raw Drizzle handle. Only for packages/db itself, packages/auth and migrations. */
export function unsafeRawDb(database: Database): AnyPgDatabase {
  const internal = internals.get(database);
  if (!internal) throw new Error("not a Database created by createDatabase()");
  return internal.db;
}

/** Read a DbConfig from environment-style variables. */
export function dbConfigFromEnv(env: Record<string, string | undefined>): DbConfig {
  const driver = (env.DATABASE_DRIVER ?? (env.DATABASE_URL ? "postgres" : "pglite")) as DbDriver;
  switch (driver) {
    case "pglite":
      return { driver, dataDir: env.PGLITE_DATA_DIR || undefined };
    case "postgres":
    case "neon": {
      const url = env.DATABASE_URL;
      if (!url) throw new Error(`DATABASE_URL is required for DATABASE_DRIVER=${driver}`);
      return { driver, url };
    }
    default:
      throw new Error(`unknown DATABASE_DRIVER: ${String(driver)}`);
  }
}
