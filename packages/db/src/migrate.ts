/**
 * Apply the Drizzle migrations, then rls.sql. Uses the same bookkeeping table
 * as drizzle-kit (`drizzle.__drizzle_migrations`), so `drizzle-kit migrate`
 * and this function agree about what has run. The SQL is embedded at build
 * time (src/migrations.gen.ts) so this works inside bundles and the desktop
 * sidecar, which have no migrations folder on disk. Runs under a Postgres
 * advisory lock, so concurrent starts are safe (03 §14).
 */
import { sql } from "drizzle-orm";
import { type Database, unsafeRawDb } from "./client";
import { MIGRATIONS, RLS_SQL } from "./migrations.gen";

export interface MigrateResult {
  applied: string[];
}

/**
 * Advisory lock key for migrations ("dueproof" as a 64-bit-safe number). Two
 * app processes starting together (a rolling upgrade, `docker compose up
 * --scale app=2`) take turns: the second waits, then finds nothing to do.
 */
export const MIGRATION_LOCK_KEY = 0x6475_6570_726f;

export async function migrate(database: Database): Promise<MigrateResult> {
  const db = unsafeRawDb(database);
  const before = await appliedHashes(database);

  // One transaction under a transaction-scoped advisory lock, so it works through
  // a pooler (Neon) as well as on a single connection (postgres-js, PGlite). This is
  // Drizzle's own migrator logic (same bookkeeping table) inlined under the lock.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`);
    await tx.execute(sql`create schema if not exists drizzle`);
    await tx.execute(sql`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )`);
    const [last] = rowsOf<{ created_at: string | number | null }>(
      await tx.execute(
        sql`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`,
      ),
    );
    const lastMillis = last?.created_at == null ? undefined : Number(last.created_at);
    for (const m of MIGRATIONS) {
      if (lastMillis !== undefined && lastMillis >= m.folderMillis) continue;
      for (const stmt of m.sql) {
        if (stmt.trim()) await tx.execute(sql.raw(stmt));
      }
      await tx.execute(
        sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.folderMillis})`,
      );
    }
    for (const stmt of RLS_SQL) {
      if (stmt.trim()) await tx.execute(sql.raw(stmt));
    }
  });

  const after = await appliedHashes(database);
  return {
    applied: MIGRATIONS.filter((m) => after.has(m.hash) && !before.has(m.hash)).map((m) => m.tag),
  };
}

async function appliedHashes(database: Database): Promise<Set<string>> {
  const db = unsafeRawDb(database);
  try {
    const rows = await db.execute<{ hash: string }>(
      sql`select hash from drizzle.__drizzle_migrations`,
    );
    return new Set(rowsOf<{ hash: string }>(rows).map((r) => r.hash));
  } catch {
    return new Set();
  }
}

/** postgres-js returns an array; PGlite and node-postgres-style drivers return `{ rows }`. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] } | null)?.rows;
  return rows ?? [];
}
