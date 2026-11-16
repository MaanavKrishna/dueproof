/**
 * `withOrg()` is the only exported way to read or write tenant data (house
 * rule 4). It opens a transaction, sets `app.org_id` and switches to the
 * non-bypass app role with transaction-local settings (they work through
 * Neon's pooler: 03 §9), and hands the scoped transaction to `fn`.
 *
 * RLS (migrations/rls.sql) then limits every statement in `fn` to that org,
 * whatever the query says. Callers should still filter by org_id so indexes
 * are used; the policy is the backstop.
 */
import { sql } from "drizzle-orm";
import { type Database, type Tx, unsafeRawDb } from "./client";

export type OrgTx = Tx;

export interface OrgContext {
  readonly orgId: string;
}

const ORG_ID = /^[A-Za-z0-9_-]{1,64}$/;

export class OrgScopeError extends Error {
  override name = "OrgScopeError";
}

export async function withOrg<T>(
  database: Database,
  orgId: string,
  fn: (tx: OrgTx, ctx: OrgContext) => Promise<T>,
): Promise<T> {
  if (typeof orgId !== "string" || !ORG_ID.test(orgId)) {
    throw new OrgScopeError("withOrg needs a valid organisation id");
  }
  const db = unsafeRawDb(database);
  return db.transaction(async (tx) => {
    if (database.appRole) {
      await tx.execute(
        sql`select set_config('app.org_id', ${orgId}, true), set_config('role', ${database.appRole}, true)`,
      );
    } else {
      await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    }
    return fn(tx, { orgId });
  });
}
