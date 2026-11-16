/**
 * The statutory calendar for one client (01 §4, 03 §8a): from the client's
 * registrations, `@dueproof/core`'s `generateStatutory` lists every return
 * and payment falling due in a rolling window, and this writes them as
 * `deadlines` rows (`source = 'statutory'`, one per org + client +
 * statutoryKey).
 *
 * Regeneration is idempotent. It never touches a row a person has finished
 * (`done`) or dismissed; it updates open rows in place, so an owner or
 * assignment survives; and it removes open statutory rows in the window that
 * no longer apply (a registration was removed or changed).
 *
 * Callers authorise first (house rule 4): see app/actions/statutory.ts.
 */
import "server-only";
import {
  addMonths,
  generateStatutory,
  type Registration,
  type StatutoryItem,
} from "@dueproof/core";
import {
  and,
  audit,
  clients,
  type Database,
  deadlines,
  eq,
  gte,
  lte,
  registrations,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { loadOrgCalendar } from "./calendar";
import type { DeadlineDetail } from "./deadline-detail";
import { notFound } from "./errors";
import { todayIn } from "./pipeline/status";

/** The rolling window: from a month ago to fifteen months ahead. */
export function statutoryWindow(today: string): { from: string; to: string } {
  return { from: addMonths(today, -1).date, to: addMonths(today, 15).date };
}

export interface RegenerateOptions {
  /** ISO date; defaults to today in the organisation's timezone. */
  today?: string;
  /** Who asked, for the audit trail (null for scheduled runs). */
  actor?: string | null;
  requestId?: string | null;
}

export interface RegenerateResult {
  from: string;
  to: string;
  /** Items the calendar produced for the window. */
  items: number;
  inserted: number;
  updated: number;
  /** Rows left alone because a person marked them done or dismissed them. */
  kept: number;
  removed: number;
}

type RegistrationRow = typeof registrations.$inferSelect;

/** A registrations row as core's calendar wants it. `attributes.events` holds per-period event dates. */
export function toRegistration(row: RegistrationRow): Registration {
  const attributes: Record<string, string | boolean> = {};
  let events: Registration["events"];
  for (const [k, v] of Object.entries(row.attributes ?? {})) {
    if (k === "events" && v && typeof v === "object") {
      events = v as Registration["events"];
    } else if (typeof v === "string" || typeof v === "boolean") {
      attributes[k] = v;
    }
  }
  const reg: Registration = {
    id: row.id,
    clientId: row.clientId,
    kind: row.kind,
    identifier: row.identifier,
    attributes,
  };
  if (row.state) reg.state = row.state;
  if (row.frequency) reg.frequency = row.frequency;
  if (row.scheme) reg.scheme = row.scheme;
  if (row.validFrom) reg.validFrom = row.validFrom;
  if (row.validTo) reg.validTo = row.validTo;
  if (events) reg.events = events;
  return reg;
}

function detailOf(item: StatutoryItem): DeadlineDetail {
  return {
    adjustments: item.adjustments,
    warnings: item.warnings,
    ...(item.originalDueOn !== item.dueOn ? { originalDueOn: item.originalDueOn } : {}),
    statutory: {
      ruleKey: item.ruleKey,
      period: item.period,
      periodLabel: item.periodLabel,
      form: item.form,
      registrationId: item.registrationId,
      source: item.source,
      verified: item.verified,
      packVersion: item.packVersion,
      packAsOf: item.packAsOf,
    },
  };
}

export async function regenerateStatutoryDeadlines(
  database: Database,
  orgId: string,
  clientId: string,
  options: RegenerateOptions = {},
): Promise<RegenerateResult> {
  const cal = await loadOrgCalendar({ database }, orgId);
  return withOrg(database, orgId, async (tx, scope) => {
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.orgId, orgId), eq(clients.id, clientId)))
      .limit(1);
    if (!client) throw notFound("That client");

    const today = options.today ?? todayIn(cal.timezone);
    const { from, to } = statutoryWindow(today);

    const regs = await tx
      .select()
      .from(registrations)
      .where(and(eq(registrations.orgId, orgId), eq(registrations.clientId, clientId)));
    const items = generateStatutory(regs.map(toRegistration), { from, to }, undefined, [], {
      calendar: { workingDays: cal.workingDays, holidays: cal.holidays },
      locale: cal.locale,
    });

    const existing = await tx
      .select({
        id: deadlines.id,
        statutoryKey: deadlines.statutoryKey,
        status: deadlines.status,
        dueOn: deadlines.dueOn,
      })
      .from(deadlines)
      .where(
        and(
          eq(deadlines.orgId, orgId),
          eq(deadlines.clientId, clientId),
          eq(deadlines.source, "statutory"),
        ),
      );
    const byKey = new Map(existing.map((d) => [d.statutoryKey, d]));

    let inserted = 0;
    let updated = 0;
    let kept = 0;
    const wanted = new Set<string>();
    for (const item of items) {
      wanted.add(item.statutoryKey);
      const values = {
        title: `${item.form} · ${item.periodLabel}`,
        dueOn: item.dueOn,
        windowEndOn: null,
        rule: item.rule,
        basis: item.basis,
        detail: { ...detailOf(item) },
      };
      const row = byKey.get(item.statutoryKey);
      if (row && row.status !== "open") {
        kept += 1;
        continue;
      }
      if (row) {
        await tx.update(deadlines).set(values).where(eq(deadlines.id, row.id));
        updated += 1;
        continue;
      }
      // The unique index (org, client, statutory_key) backs this up under concurrency;
      // a row someone finished in the meantime is still left alone.
      await tx
        .insert(deadlines)
        .values({
          id: uuidv7(),
          orgId,
          clientId,
          source: "statutory",
          statutoryKey: item.statutoryKey,
          ...values,
        })
        .onConflictDoUpdate({
          target: [deadlines.orgId, deadlines.clientId, deadlines.statutoryKey],
          set: values,
          setWhere: eq(deadlines.status, "open"),
        });
      inserted += 1;
    }

    // Open statutory rows in the window that the calendar no longer produces.
    let removed = 0;
    const stale = existing.filter(
      (d) =>
        d.status === "open" &&
        d.statutoryKey !== null &&
        !wanted.has(d.statutoryKey) &&
        d.dueOn >= from &&
        d.dueOn <= to,
    );
    for (const d of stale) {
      await tx
        .delete(deadlines)
        .where(
          and(
            eq(deadlines.orgId, orgId),
            eq(deadlines.id, d.id),
            eq(deadlines.status, "open"),
            eq(deadlines.source, "statutory"),
            gte(deadlines.dueOn, from),
            lte(deadlines.dueOn, to),
          ),
        );
      removed += 1;
    }

    const result = { from, to, items: items.length, inserted, updated, kept, removed };
    await audit.write(tx, scope, {
      actor: options.actor ?? null,
      action: "statutory.regenerated",
      targetType: "client",
      targetId: clientId,
      requestId: options.requestId ?? null,
      detail: result,
    });
    return result;
  });
}
