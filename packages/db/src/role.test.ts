import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database, unsafeRawDb } from "./client";
import { rowsOf } from "./migrate";
import { RLS_SQL } from "./migrations.gen";

/**
 * Hosted Postgres (Neon) connects as a database owner that is not a superuser.
 * Since Postgres 16, a role's creator is an admin of it but may not SET ROLE to
 * it unless granted SET, so withOrg() failed with `permission denied to set
 * role "dueproof_app"`. Re-run the role part of rls.sql as such an owner, and
 * check that it can then switch to the app role.
 */
let database: Database;

beforeAll(async () => {
  database = await createDatabase({ driver: "pglite" });
});
afterAll(async () => {
  await database.close();
});

describe("the app role on hosted Postgres", () => {
  it("lets a non-superuser owner that created dueproof_app switch to it", async () => {
    const raw = unsafeRawDb(database);
    const roleStatements = RLS_SQL.filter(
      (s) => s.includes("CREATE ROLE dueproof_app") || s.includes("GRANT dueproof_app TO"),
    );
    expect(roleStatements).toHaveLength(2);

    await raw.execute(sql.raw("CREATE ROLE hosted_owner LOGIN CREATEROLE NOSUPERUSER"));
    await raw.execute(sql.raw("SET SESSION AUTHORIZATION hosted_owner"));
    try {
      for (const stmt of roleStatements) await raw.execute(sql.raw(stmt));
      // Twice: rls.sql runs on every start and must stay idempotent.
      for (const stmt of roleStatements) await raw.execute(sql.raw(stmt));
      await raw.execute(sql.raw("SET ROLE dueproof_app"));
      const [row] = rowsOf<{ who: string }>(
        await raw.execute(sql.raw("select current_user as who")),
      );
      expect(row?.who ?? "").toBe("dueproof_app");
    } finally {
      await raw.execute(sql.raw("RESET ROLE"));
      await raw.execute(sql.raw("RESET SESSION AUTHORIZATION"));
    }
  });
});
