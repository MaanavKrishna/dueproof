/**
 * Apply the Drizzle migrations, then rls.sql. Uses the same bookkeeping table
 * as drizzle-kit (`drizzle.__drizzle_migrations`), so `drizzle-kit migrate`
 * and this function agree about what has run. The SQL is embedded at build
 * time (src/migrations.gen.ts) so this works inside bundles and the desktop
 * sidecar, which have no migrations folder on disk.
 */
import { sql } from "drizzle-orm";
import type { MigrationMeta } from "drizzle-orm/migrator";
import type { PgDialect, PgSession } from "drizzle-orm/pg-core";
import { type Database, unsafeRawDb } from "./client";
import { MIGRATIONS, RLS_SQL } from "./migrations.gen";

export interface MigrateResult {
  applied: string[];
}

export async function migrate(database: Database): Promise<MigrateResult> {
  const db = unsafeRawDb(database);
  // Drizzle keeps dialect and session on the instance; they're not in its public type.
  const { dialect, session } = db as unknown as { dialect: PgDialect; session: PgSession };

  const before = await appliedHashes(database);
  const metas: MigrationMeta[] = MIGRATIONS.map((m) => ({
    sql: m.sql,
    bps: m.bps,
    folderMillis: m.folderMillis,
    hash: m.hash,
  }));
  await dialect.migrate(metas, session, { migrationsFolder: "(embedded)" });

  await db.transaction(async (tx) => {
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
