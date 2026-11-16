import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { audit } from "./audit";
import { createDatabase, type Database, unsafeRawDb } from "./client";
import { isUuidv7, uuidv7, uuidv7Time } from "./id";
import { migrate, rowsOf } from "./migrate";
import { RLS_SQL } from "./migrations.gen";
import { clients, documents, findingEdits, TENANT_TABLES } from "./schema";
import { withOrg } from "./tenant";

/** Drizzle wraps driver errors ("Failed query: …"); the reason is on `cause`. */
async function failure(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
  throw new Error("expected the query to fail");
}

const ORG_A = uuidv7();
const ORG_B = uuidv7();

let database: Database;

beforeAll(async () => {
  // PGlite by default; set TEST_DATABASE_URL to run the same suite on a real Postgres.
  const url = process.env.TEST_DATABASE_URL;
  database = await createDatabase(url ? { driver: "postgres", url } : { driver: "pglite" });
  await migrate(database);
});
afterAll(async () => {
  await database.close();
});

describe("uuidv7", () => {
  it("is version 7, unique and time-ordered", () => {
    const ids = Array.from({ length: 2000 }, () => uuidv7());
    expect(ids.every(isUuidv7)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
    const t = uuidv7Time(uuidv7(Date.UTC(2026, 10, 16)));
    expect(t.toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });
});

describe("migrations", () => {
  it("create every table and are idempotent", async () => {
    const again = await migrate(database);
    expect(again.applied).toEqual([]);
    const raw = unsafeRawDb(database);
    const rows = rowsOf<{ tablename: string; rowsecurity: boolean; forced: boolean }>(
      await raw.execute(sql`
        select c.relname as tablename, c.relrowsecurity as rowsecurity, c.relforcerowsecurity as forced
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`),
    );
    const byName = new Map(rows.map((r) => [r.tablename, r]));
    for (const t of TENANT_TABLES) {
      expect(byName.get(t), t).toMatchObject({ rowsecurity: true, forced: true });
    }
    for (const t of [
      "user",
      "session",
      "organization",
      "member",
      "invitation",
      "passkey",
      "two_factor",
    ]) {
      expect(byName.has(t), t).toBe(true);
    }
  });

  it("serialise concurrent runs under the advisory lock", async () => {
    const results = await Promise.all([migrate(database), migrate(database), migrate(database)]);
    expect(results.map((r) => r.applied)).toEqual([[], [], []]);
  });

  it("rls.sql lists exactly TENANT_TABLES", () => {
    const text = RLS_SQL.join("");
    const list = text.match(/tenant_tables text\[\] := ARRAY\[([^\]]+)\]/)?.[1] ?? "";
    const names = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(new Set(names)).toEqual(new Set(TENANT_TABLES));
  });
});

describe("tenant isolation", () => {
  beforeAll(async () => {
    await withOrg(database, ORG_A, (tx) =>
      tx.insert(clients).values({ id: uuidv7(), orgId: ORG_A, name: "Harbour Valley Components" }),
    );
    await withOrg(database, ORG_B, (tx) =>
      tx.insert(clients).values({ id: uuidv7(), orgId: ORG_B, name: "Northline Traders" }),
    );
  });

  it("org A sees only its own rows, even without a where clause", async () => {
    const a = await withOrg(database, ORG_A, (tx) => tx.select().from(clients));
    expect(a.map((c) => c.name)).toEqual(["Harbour Valley Components"]);
    const b = await withOrg(database, ORG_B, (tx) => tx.select().from(clients));
    expect(b.map((c) => c.name)).toEqual(["Northline Traders"]);
  });

  it("org A cannot read org B's rows by asking for them", async () => {
    const rows = await withOrg(database, ORG_A, (tx) =>
      tx.select().from(clients).where(eq(clients.orgId, ORG_B)),
    );
    expect(rows).toEqual([]);
  });

  it("org A cannot write rows into org B", async () => {
    const reason = await failure(
      withOrg(database, ORG_A, (tx) =>
        tx.insert(clients).values({ id: uuidv7(), orgId: ORG_B, name: "Planted" }),
      ),
    );
    expect(reason).toMatch(/row-level security/);
  });

  it("org A cannot update or delete org B's rows", async () => {
    await withOrg(database, ORG_A, async (tx) => {
      await tx.update(clients).set({ name: "Hijacked" }).where(eq(clients.orgId, ORG_B));
      await tx.delete(clients).where(eq(clients.orgId, ORG_B));
    });
    const b = await withOrg(database, ORG_B, (tx) => tx.select().from(clients));
    expect(b.map((c) => c.name)).toEqual(["Northline Traders"]);
  });

  it("the org setting does not leak out of the transaction", async () => {
    const raw = unsafeRawDb(database);
    const rows = rowsOf<{ org: string | null; role: string }>(
      await raw.execute(
        sql`select current_setting('app.org_id', true) as org, current_user as role`,
      ),
    );
    expect(rows[0]?.org ?? "").toBe("");
    expect(rows[0]?.role).not.toBe("dueproof_app");
  });

  it("the app role sees nothing when no org is set", async () => {
    const raw = unsafeRawDb(database);
    const count = await raw.transaction(async (tx) => {
      await tx.execute(sql`select set_config('role', 'dueproof_app', true)`);
      return rowsOf<{ n: number }>(await tx.execute(sql`select count(*)::int as n from clients`));
    });
    expect(count[0]?.n).toBe(0);
  });

  it("the app role cannot read auth tables", async () => {
    const reason = await failure(
      withOrg(database, ORG_A, (tx) => tx.execute(sql`select * from "user"`)),
    );
    expect(reason).toMatch(/permission denied/);
  });

  it("dedupes documents per org, not across orgs", async () => {
    const doc = (orgId: string) => ({
      id: uuidv7(),
      orgId,
      filename: "n.pdf",
      mime: "application/pdf",
      sizeBytes: 1,
      sha256: "abc",
      storageKey: `org/${orgId}/originals/abc`,
    });
    await withOrg(database, ORG_A, (tx) => tx.insert(documents).values(doc(ORG_A)));
    await withOrg(database, ORG_B, (tx) => tx.insert(documents).values(doc(ORG_B)));
    await expect(
      withOrg(database, ORG_A, (tx) => tx.insert(documents).values(doc(ORG_A))),
    ).rejects.toThrow();
  });

  it("rejects a bad org id", async () => {
    expect(await failure(withOrg(database, "", async () => 1))).toMatch(/organisation id/);
    expect(await failure(withOrg(database, "x' or 1=1 --", async () => 1))).toMatch(
      /organisation id/,
    );
  });
});

describe("append-only tables", () => {
  it("finding_edits rejects update and delete", async () => {
    await withOrg(database, ORG_A, (tx) =>
      tx
        .insert(findingEdits)
        .values({ orgId: ORG_A, findingId: "f1", field: "dueOn", before: "a", after: "b" }),
    );
    const upd = await failure(
      withOrg(database, ORG_A, (tx) => tx.update(findingEdits).set({ note: "rewrite" })),
    );
    expect(upd).toMatch(/permission denied|append-only/);
    const del = await failure(withOrg(database, ORG_A, (tx) => tx.delete(findingEdits)));
    expect(del).toMatch(/permission denied|append-only/);
    // Even the owner (no role switch, bypassing RLS) is stopped by the trigger.
    const raw = unsafeRawDb(database);
    expect(await failure(raw.execute(sql`update finding_edits set note = 'x'`))).toMatch(
      /append-only/,
    );
    expect(await failure(raw.execute(sql`delete from finding_edits`))).toMatch(/append-only/);
    expect(await failure(raw.execute(sql`truncate finding_edits`))).toMatch(/append-only/);
  });

  it("audit rejects update and delete", async () => {
    await withOrg(database, ORG_A, (tx, ctx) =>
      audit.write(tx, ctx, { actor: "u1", action: "test" }),
    );
    const raw = unsafeRawDb(database);
    expect(await failure(raw.execute(sql`update audit set action = 'x'`))).toMatch(/append-only/);
    expect(await failure(raw.execute(sql`delete from audit`))).toMatch(/append-only/);
  });
});

describe("audit hash chain", () => {
  it("chains entries per org and verifies", async () => {
    const org = uuidv7();
    const records = await withOrg(database, org, async (tx, ctx) => [
      await audit.write(tx, ctx, {
        actor: "u1",
        action: "document.upload",
        targetType: "document",
        targetId: "d1",
      }),
      await audit.write(tx, ctx, {
        actor: "u1",
        action: "finding.edit",
        detail: { field: "dueOn", z: 1, a: [2] },
      }),
      await audit.write(tx, ctx, { actor: null, action: "workflow.done" }),
    ]);
    expect(records[0]?.prevHash).toBeNull();
    expect(records[1]?.prevHash).toBe(records[0]?.hash);
    expect(records[2]?.prevHash).toBe(records[1]?.hash);
    const result = await withOrg(database, org, (tx, ctx) => audit.verify(tx, ctx));
    expect(result).toEqual({ ok: true, count: 3 });
  });

  it("detects a tampered row", async () => {
    const org = uuidv7();
    await withOrg(database, org, async (tx, ctx) => {
      await audit.write(tx, ctx, { actor: "u1", action: "a" });
      await audit.write(tx, ctx, { actor: "u1", action: "b" });
    });
    // Simulate tampering by someone with superuser access: drop the trigger, edit, restore.
    const raw = unsafeRawDb(database);
    await raw.transaction(async (tx) => {
      await tx.execute(sql`alter table audit disable trigger audit_append_only`);
      await tx.execute(
        sql`update audit set action = 'forged' where org_id = ${org} and action = 'a'`,
      );
      await tx.execute(sql`alter table audit enable trigger audit_append_only`);
    });
    const result = await withOrg(database, org, (tx, ctx) => audit.verify(tx, ctx));
    expect(result.ok).toBe(false);
  });
});
