/**
 * The audit trail: append-only (triggers in rls.sql) and hash-chained per
 * organisation (05 §2). Each row's hash covers its content and the previous
 * row's hash, so removing or editing a row breaks every hash after it.
 *
 *   hash = sha256( canonicalJSON({ orgId, at, actor, action, targetType,
 *                                  targetId, requestId, detail, prevHash }) )
 *
 * `write` takes a transaction-scoped advisory lock per org so concurrent
 * writers chain one after the other. It must be called inside `withOrg()`.
 */
import { createHash } from "node:crypto";
import { asc, desc, eq, sql } from "drizzle-orm";
import { audit as auditTable } from "./schema";
import type { OrgContext, OrgTx } from "./tenant";

export interface AuditEntry {
  actor: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  /** Never document text, keys or tokens (house rule 5). */
  detail?: unknown;
}

export interface AuditRecord {
  id: number;
  hash: string;
  prevHash: string | null;
}

function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export function auditHash(fields: {
  orgId: string;
  at: Date;
  actor: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  requestId: string | null;
  detail: unknown;
  prevHash: string | null;
}): string {
  return createHash("sha256").update(canonical(fields)).digest("hex");
}

async function write(tx: OrgTx, ctx: OrgContext, entry: AuditEntry): Promise<AuditRecord> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`audit:${ctx.orgId}`}))`);
  const [last] = await tx
    .select({ hash: auditTable.hash })
    .from(auditTable)
    .where(eq(auditTable.orgId, ctx.orgId))
    .orderBy(desc(auditTable.id))
    .limit(1);
  const prevHash = last?.hash ?? null;
  // Postgres keeps microseconds; we hash and store milliseconds so the value round-trips.
  const at = new Date(Math.floor(Date.now()));
  const fields = {
    orgId: ctx.orgId,
    at,
    actor: entry.actor,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    requestId: entry.requestId ?? null,
    detail: entry.detail ?? null,
    prevHash,
  };
  const hash = auditHash(fields);
  const [row] = await tx
    .insert(auditTable)
    .values({ ...fields, detail: fields.detail as object | null, hash })
    .returning({ id: auditTable.id });
  if (!row) throw new Error("audit insert returned no row");
  return { id: row.id, hash, prevHash };
}

export interface VerifyResult {
  ok: boolean;
  count: number;
  /** First row whose hash or link does not match. */
  brokenAt?: number;
}

async function verify(tx: OrgTx, ctx: OrgContext): Promise<VerifyResult> {
  const rows = await tx
    .select()
    .from(auditTable)
    .where(eq(auditTable.orgId, ctx.orgId))
    .orderBy(asc(auditTable.id));
  let prev: string | null = null;
  for (const row of rows) {
    const expected = auditHash({
      orgId: row.orgId,
      at: row.at,
      actor: row.actor,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      requestId: row.requestId,
      detail: row.detail,
      prevHash: row.prevHash,
    });
    if (row.prevHash !== prev || row.hash !== expected) {
      return { ok: false, count: rows.length, brokenAt: row.id };
    }
    prev = row.hash;
  }
  return { ok: true, count: rows.length };
}

export const audit = { write, verify };
