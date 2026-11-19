import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { audit } from "./audit";
import { createDatabase, type Database, unsafeRawDb } from "./client";
import { uuidv7 } from "./id";
import { migrate, rowsOf } from "./migrate";
import { clients, orgSettings } from "./schema";
import { withOrg } from "./tenant";

/**
 * Production databases are not run by a superuser. Hosted Postgres (Neon)
 * hands the app a database owner with CREATEROLE and nothing more, and
 * self-hosted operators are told to do the same. The rest of the suite runs
 * as PGlite's superuser, which bypasses every permission check, so a
 * migration or withOrg() that only works for a superuser would pass there
 * and fail in production (it did: `permission denied to set role`).
 *
 * Here the whole migration runs, from an empty database, as such an owner,
 * and then withOrg() is used as that owner, isolation included.
 */
let database: Database;
const ORG_A = uuidv7();
const ORG_B = uuidv7();

async function failure(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
  throw new Error("expected the query to fail");
}

beforeAll(async () => {
  database = await createDatabase({ driver: "pglite" });
  const raw = unsafeRawDb(database);
  // As on Neon: the login role owns the database (and so public, through
  // pg_database_owner) and may create roles, but is not a superuser.
  await raw.execute(sql.raw("CREATE ROLE neon_owner LOGIN CREATEROLE NOSUPERUSER NOBYPASSRLS"));
  await raw.execute(sql.raw("ALTER DATABASE postgres OWNER TO neon_owner"));
  await raw.execute(sql.raw("SET SESSION AUTHORIZATION neon_owner"));
});

afterAll(async () => {
  const raw = unsafeRawDb(database);
  await raw.execute(sql.raw("RESET ROLE"));
  await raw.execute(sql.raw("RESET SESSION AUTHORIZATION"));
  await database.close();
});

describe("a database owner that is not a superuser", () => {
  it("is not a superuser (the premise of this file)", async () => {
    const raw = unsafeRawDb(database);
    const [row] = rowsOf<{ who: string; su: boolean }>(
      await raw.execute(
        sql.raw(
          "select current_user as who, rolsuper as su from pg_roles where rolname = current_user",
        ),
      ),
    );
    expect(row).toEqual({ who: "neon_owner", su: false });
  });

  it("runs every migration and rls.sql from an empty database, twice", async () => {
    const first = await migrate(database);
    expect(first.applied.length).toBeGreaterThan(0);
    // rls.sql runs on every start.
    const again = await migrate(database);
    expect(again.applied).toEqual([]);
  });

  it("writes and reads tenant rows through withOrg", async () => {
    await withOrg(database, ORG_A, async (tx, ctx) => {
      await tx.insert(orgSettings).values({ orgId: ORG_A }).onConflictDoNothing();
      await tx.insert(clients).values({ id: uuidv7(), orgId: ORG_A, name: "Harbour Valley" });
      await audit.write(tx, ctx, { actor: "u1", action: "organisation.create" });
    });
    await withOrg(database, ORG_B, async (tx) => {
      await tx.insert(clients).values({ id: uuidv7(), orgId: ORG_B, name: "Northline Traders" });
    });
    const who = await withOrg(database, ORG_A, async (tx) =>
      rowsOf<{ who: string }>(await tx.execute(sql`select current_user as who`)),
    );
    expect(who[0]?.who).toBe("dueproof_app");
  });

  it("keeps each organisation to its own rows", async () => {
    const a = await withOrg(database, ORG_A, (tx) => tx.select().from(clients));
    expect(a.map((c) => c.name)).toEqual(["Harbour Valley"]);
    const b = await withOrg(database, ORG_B, (tx) => tx.select().from(clients));
    expect(b.map((c) => c.name)).toEqual(["Northline Traders"]);
    const reason = await failure(
      withOrg(database, ORG_A, (tx) =>
        tx.insert(clients).values({ id: uuidv7(), orgId: ORG_B, name: "Planted" }),
      ),
    );
    expect(reason).toMatch(/row-level security/);
  });

  it("sees no tenant rows outside withOrg, though it owns the tables", async () => {
    const raw = unsafeRawDb(database);
    const rows = rowsOf<{ n: number | string }>(
      await raw.execute(sql`select count(*) as n from clients`),
    );
    expect(Number(rows[0]?.n)).toBe(0);
  });

  it("can't change the audit trail, even as the owner", async () => {
    const raw = unsafeRawDb(database);
    await raw.execute(sql`select set_config('app.org_id', ${ORG_A}, false)`);
    try {
      expect(await failure(raw.execute(sql`delete from audit`))).toMatch(/append-only/);
    } finally {
      await raw.execute(sql`select set_config('app.org_id', '', false)`);
    }
  });
});
