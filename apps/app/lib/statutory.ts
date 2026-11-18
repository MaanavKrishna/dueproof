/**
 * The statutory calendar for one client (01 §4, 03 §8a): from the client's
 * registrations, `@dueproof/core`'s `generateStatutory` lists every return
 * and payment falling due in a rolling window, and this writes them as
 * `deadlines` rows (`source = 'statutory'`, one per org + client +
 * statutoryKey). The daily job runs it for every client, so the window rolls
 * forward; actions run it when registrations change.
 *
 * Regeneration is idempotent, and never loses what a person did:
 *
 * - A row is keyed on (registration, form, period), so a change of state
 *   group or audit flag updates the same row. Rows written under the old
 *   (rule, period) key are re-keyed in place.
 * - Rows a person finished (`done`) or dismissed are left alone.
 * - An open row's owner, snooze, acknowledgement number and any other note
 *   a person added to `detail` are kept; only the calendar's own fields
 *   (date, basis, adjustments, warnings, source) are refreshed.
 * - A date corrected by hand is kept. If the calendar's date later differs
 *   from it, the row says so in a warning; it is never overwritten.
 * - An open row the calendar no longer produces is removed only if no one
 *   has touched it. Otherwise it stays, with a warning to check it.
 * - Government extensions (`IN_EXTENSIONS`, data with a source) are applied.
 *
 * Callers authorise first (house rule 4): see app/actions/statutory.ts.
 */
import "server-only";
import {
  addMonths,
  type CoverageNote,
  type Extension,
  generateStatutory,
  IN_EXTENSIONS,
  IN_PACK,
  type Registration,
  type StatutoryItem,
  statutoryCoverage,
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
import { formatDate } from "@dueproof/i18n";
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
  /** Due-date extensions to apply. Default: the India pack's (`IN_EXTENSIONS`). */
  extensions?: readonly Extension[];
}

export interface RegenerateResult {
  from: string;
  to: string;
  /** Items the calendar produced for the window. */
  items: number;
  inserted: number;
  /** Open rows whose calendar fields changed. */
  updated: number;
  /** Rows left alone because a person marked them done or dismissed them. */
  kept: number;
  removed: number;
  /** Open rows no longer produced but kept, because a person had touched them. */
  flagged: number;
  /** What the calendar does not cover for this client's registrations. */
  coverage: CoverageNote[];
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

/** What the calendar does not cover for these registrations (shown on the client page). */
export function registrationCoverage(rows: readonly RegistrationRow[]): CoverageNote[] {
  return statutoryCoverage(rows.map(toRegistration), IN_PACK);
}

/** `detail` keys the calendar owns; everything else in `detail` belongs to a person. */
const CALENDAR_KEYS = [
  "adjustments",
  "warnings",
  "originalDueOn",
  "inputs",
  "statutory",
  "calendarDueOn",
] as const;

type Detail = DeadlineDetail & {
  correctedBy?: string;
  snoozedUntil?: string;
  ackNumber?: string;
  /** For a hand-corrected row: the date the calendar gives now. */
  calendarDueOn?: string;
} & Record<string, unknown>;

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

function personFields(detail: Detail): Record<string, unknown> {
  const out: Record<string, unknown> = { ...detail };
  for (const k of CALENDAR_KEYS) delete out[k];
  return out;
}

function correctedByHand(row: { basis: string; detail: Detail }): boolean {
  return Boolean(row.detail.correctedBy) || row.basis.startsWith("Corrected by hand");
}

/** Someone has done something to the row that a delete would lose. */
function touched(row: { basis: string; detail: Detail; ownerUserId: string | null }): boolean {
  return (
    correctedByHand(row) ||
    row.ownerUserId !== null ||
    Boolean(row.detail.snoozedUntil) ||
    Boolean(row.detail.ackNumber)
  );
}

/** JSON with sorted keys: jsonb does not keep key order, so compare this way. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}

const STALE_WARNING =
  "No longer on the statutory calendar for this client's registrations. It was kept because someone worked on it: check it, and dismiss it if it no longer applies.";

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
    const fmt = (iso: string) => formatDate(iso, { locale: cal.locale });

    const regs = await tx
      .select()
      .from(registrations)
      .where(and(eq(registrations.orgId, orgId), eq(registrations.clientId, clientId)));
    const items = generateStatutory(
      regs.map(toRegistration),
      { from, to },
      IN_PACK,
      options.extensions ?? IN_EXTENSIONS,
      {
        calendar: { workingDays: cal.workingDays, holidays: cal.holidays },
        locale: cal.locale,
      },
    );
    const coverage = registrationCoverage(regs);

    const existing = (
      await tx
        .select({
          id: deadlines.id,
          statutoryKey: deadlines.statutoryKey,
          status: deadlines.status,
          title: deadlines.title,
          dueOn: deadlines.dueOn,
          windowEndOn: deadlines.windowEndOn,
          rule: deadlines.rule,
          basis: deadlines.basis,
          detail: deadlines.detail,
          ownerUserId: deadlines.ownerUserId,
        })
        .from(deadlines)
        .where(
          and(
            eq(deadlines.orgId, orgId),
            eq(deadlines.clientId, clientId),
            eq(deadlines.source, "statutory"),
          ),
        )
    ).map((d) => ({ ...d, detail: (d.detail ?? {}) as Detail }));
    type Row = (typeof existing)[number];
    const byKey = new Map<string, Row>();
    for (const d of existing) if (d.statutoryKey) byKey.set(d.statutoryKey, d);

    /**
     * The row for an item: under its key, or under the key rows had before
     * keys included the registration (`${ruleKey}:${period}`), which is
     * re-keyed in place so its status, owner and history carry over.
     */
    const rowFor = async (item: StatutoryItem): Promise<Row | undefined> => {
      const row = byKey.get(item.statutoryKey);
      if (row) return row;
      const legacyKey = `${item.ruleKey}:${item.period}`;
      const legacy = byKey.get(legacyKey);
      const legacyReg = legacy?.detail.statutory?.registrationId;
      if (!legacy || (legacyReg && legacyReg !== item.registrationId)) return undefined;
      await tx
        .update(deadlines)
        .set({ statutoryKey: item.statutoryKey })
        .where(and(eq(deadlines.orgId, orgId), eq(deadlines.id, legacy.id)));
      byKey.delete(legacyKey);
      legacy.statutoryKey = item.statutoryKey;
      byKey.set(item.statutoryKey, legacy);
      return legacy;
    };

    let inserted = 0;
    let updated = 0;
    let kept = 0;
    const wanted = new Set<string>();
    for (const item of items) {
      wanted.add(item.statutoryKey);
      const generated = {
        title: `${item.form} · ${item.periodLabel}`,
        dueOn: item.dueOn,
        windowEndOn: null,
        rule: item.rule,
        basis: item.basis,
        detail: { ...detailOf(item) } as Record<string, unknown>,
      };
      const row = await rowFor(item);
      if (row && row.status !== "open") {
        kept += 1;
        continue;
      }
      if (row) {
        let next: typeof generated;
        if (correctedByHand(row)) {
          // The person's date and reason stand; the calendar's date is noted beside them.
          const differs = item.dueOn !== row.dueOn;
          next = {
            ...generated,
            dueOn: row.dueOn,
            basis: row.basis,
            detail: {
              ...row.detail,
              statutory: detailOf(item).statutory,
              calendarDueOn: item.dueOn,
              warnings: [
                ...item.warnings,
                ...(differs
                  ? [
                      `The calendar now gives ${fmt(item.dueOn)}. The date corrected by hand (${fmt(row.dueOn)}) is kept: check which is right.`,
                    ]
                  : []),
              ],
            },
          };
        } else {
          next = { ...generated, detail: { ...personFields(row.detail), ...generated.detail } };
        }
        const same =
          next.title === row.title &&
          next.dueOn === row.dueOn &&
          next.windowEndOn === row.windowEndOn &&
          next.basis === row.basis &&
          stable(next.rule) === stable(row.rule) &&
          stable(next.detail) === stable(row.detail);
        if (!same) {
          await tx
            .update(deadlines)
            .set(next)
            .where(and(eq(deadlines.orgId, orgId), eq(deadlines.id, row.id)));
          updated += 1;
        }
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
          ...generated,
        })
        .onConflictDoUpdate({
          target: [deadlines.orgId, deadlines.clientId, deadlines.statutoryKey],
          set: generated,
          setWhere: eq(deadlines.status, "open"),
        });
      inserted += 1;
    }

    // Open statutory rows in the window that the calendar no longer produces.
    let removed = 0;
    let flagged = 0;
    const stale = existing.filter(
      (d) =>
        d.status === "open" &&
        d.statutoryKey !== null &&
        !wanted.has(d.statutoryKey) &&
        d.dueOn >= from &&
        d.dueOn <= to,
    );
    for (const d of stale) {
      if (touched(d)) {
        const warnings = d.detail.warnings ?? [];
        if (!warnings.includes(STALE_WARNING)) {
          await tx
            .update(deadlines)
            .set({ detail: { ...d.detail, warnings: [...warnings, STALE_WARNING] } })
            .where(and(eq(deadlines.orgId, orgId), eq(deadlines.id, d.id)));
        }
        flagged += 1;
        continue;
      }
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

    const result = {
      from,
      to,
      items: items.length,
      inserted,
      updated,
      kept,
      removed,
      flagged,
      coverage,
    };
    // A scheduled run that changed nothing leaves no audit line.
    if (options.actor || inserted + updated + removed > 0) {
      const { coverage: _c, ...counts } = result;
      await audit.write(tx, scope, {
        actor: options.actor ?? null,
        action: "statutory.regenerated",
        targetType: "client",
        targetId: clientId,
        requestId: options.requestId ?? null,
        detail: { ...counts, notCovered: coverage.length },
      });
    }
    return result;
  });
}

/**
 * Regenerate every client of an organisation that has registrations (the
 * daily job). One client's failure does not stop the others.
 */
export async function regenerateOrgStatutory(
  database: Database,
  orgId: string,
  options: Pick<RegenerateOptions, "today" | "extensions"> = {},
): Promise<{
  clients: number;
  inserted: number;
  updated: number;
  removed: number;
  failed: number;
}> {
  const rows = await withOrg(database, orgId, (tx) =>
    tx
      .selectDistinct({ clientId: registrations.clientId })
      .from(registrations)
      .where(eq(registrations.orgId, orgId)),
  );
  const out = { clients: 0, inserted: 0, updated: 0, removed: 0, failed: 0 };
  for (const { clientId } of rows) {
    try {
      const r = await regenerateStatutoryDeadlines(database, orgId, clientId, {
        ...options,
        actor: null,
      });
      out.clients += 1;
      out.inserted += r.inserted;
      out.updated += r.updated;
      out.removed += r.removed;
    } catch (e) {
      // Never log document text or keys (house rule 5): the error's name only.
      console.error("statutory regeneration failed", e instanceof Error ? e.name : typeof e);
      out.failed += 1;
    }
  }
  return out;
}
