/**
 * The received date (01 §4: editable, with history) and the deadlines that
 * rest on it.
 *
 * - Anchors: what a document gives a date rule. A notice's findings count
 *   from receipt or issue; an order's appeal window from service (taken as
 *   the received date) or the order date.
 * - Assumed: when nobody gave the received date at upload, the upload day
 *   stands in for it (`documents.received_on_assumed`). Every deadline that
 *   counts from it carries the warning below until a person sets the date.
 * - Recompute: setting or correcting the date recomputes every open deadline
 *   of the document that counts from it, the notice's and the order's appeal
 *   window alike, and rewrites their working (`detail`). A date corrected by
 *   hand is a fixed date and is left alone.
 */
import "server-only";
import { DateRule } from "@dueproof/contracts";
import {
  type DateContext,
  inOrderWindows,
  isDateError,
  type ResolvedDateDetail,
  resolveDate,
  resolveOrderWindow,
} from "@dueproof/core";
import {
  and,
  audit,
  deadlines,
  documents,
  eq,
  findings,
  isNull,
  type OrgTx,
  sql,
} from "@dueproof/db";
import type { OrgCalendar } from "./calendar";
import type { DeadlineDetail } from "./deadline-detail";

export const RECEIVED_ASSUMED_WARNING =
  "Received date assumed: confirm. The upload day was used; set the day the notice arrived.";

type DocumentRow = typeof documents.$inferSelect;
type DocDates = Pick<DocumentRow, "receivedOn" | "issuedOn">;

/** The anchors a document gives its findings' date rules. */
export function findingAnchors(doc: DocDates): DateContext["anchors"] {
  return {
    ...(doc.receivedOn ? { receipt: doc.receivedOn } : {}),
    ...(doc.issuedOn ? { issue: doc.issuedOn } : {}),
  };
}

/** The anchors an order gives its appeal window: served on the day it was received. */
export function orderAnchors(doc: DocDates): DateContext["anchors"] {
  return {
    ...(doc.receivedOn ? { service: doc.receivedOn, receipt: doc.receivedOn } : {}),
    ...(doc.issuedOn ? { order: doc.issuedOn, issue: doc.issuedOn } : {}),
  };
}

/** Does this date rule count from the day the document was received (or served)? */
export function countsFromReceipt(rule: unknown): boolean {
  const r = DateRule.safeParse(rule);
  return (
    r.success &&
    r.data.type === "relative" &&
    (r.data.anchor === "receipt" || r.data.anchor === "service")
  );
}

/** Is this rule's date resting on a received date nobody gave? */
export function restsOnAssumedReceipt(
  doc: Pick<DocumentRow, "receivedOnAssumed">,
  rule: unknown,
): boolean {
  return doc.receivedOnAssumed && countsFromReceipt(rule);
}

/** Add the "received date assumed" flag to a deadline's working, when it applies. */
export function flagAssumed<T extends DeadlineDetail>(detail: T, assumed: boolean): T {
  const warnings = detail.warnings.filter((w) => w !== RECEIVED_ASSUMED_WARNING);
  const { receivedOnAssumed: _r, ...rest } = detail;
  return assumed
    ? ({ ...rest, warnings: [...warnings, RECEIVED_ASSUMED_WARNING], receivedOnAssumed: true } as T)
    : ({ ...rest, warnings } as T);
}

/** The date engine's fields of `detail`, rebuilt from a fresh result; everything else is kept. */
export function refreshDetail(
  old: Record<string, unknown> | null,
  r: ResolvedDateDetail,
  assumed: boolean,
): Record<string, unknown> {
  const {
    adjustments: _a,
    warnings: _w,
    windowBasis: _b,
    originalDueOn: _o,
    inputs: _i,
    receivedOnAssumed: _r,
    ...keep
  } = old ?? {};
  const engine: DeadlineDetail = {
    adjustments: r.adjustments,
    warnings: r.warnings,
    ...(r.windowBasis ? { windowBasis: r.windowBasis } : {}),
    ...(r.originalDueOn ? { originalDueOn: r.originalDueOn } : {}),
    inputs: r.inputs,
  };
  return { ...keep, ...flagAssumed(engine, assumed) };
}

interface Actor {
  orgId: string;
  userId: string;
  requestId?: string | null;
}

/**
 * Recompute every open deadline of a document that counts from its received
 * date: deadlines from its findings and, for an order, its appeal window.
 * `doc` carries the new date. Returns how many rows changed.
 */
export async function recomputeFromReceipt(
  tx: OrgTx,
  scope: { orgId: string },
  actor: Actor,
  doc: DocumentRow,
  cal: OrgCalendar,
  reason: string,
): Promise<number> {
  const calendar = { holidays: cal.holidays, workingDays: cal.workingDays, locale: cal.locale };
  const fromFindings = await tx
    .select({ d: deadlines })
    .from(deadlines)
    .innerJoin(
      findings,
      and(eq(findings.orgId, deadlines.orgId), eq(findings.id, deadlines.findingId)),
    )
    .where(
      and(
        eq(deadlines.orgId, actor.orgId),
        eq(findings.documentId, doc.id),
        eq(deadlines.status, "open"),
      ),
    );
  const windows = await tx
    .select()
    .from(deadlines)
    .where(
      and(
        eq(deadlines.orgId, actor.orgId),
        eq(deadlines.source, "order"),
        isNull(deadlines.findingId),
        eq(deadlines.status, "open"),
        sql`${deadlines.detail}->>'documentId' = ${doc.id}`,
      ),
    );

  const rows = [
    ...fromFindings.map(({ d }) => ({ d, window: false })),
    ...windows.map((d) => ({ d, window: true })),
  ];
  let changed = 0;
  for (const { d, window } of rows) {
    const detail = (d.detail ?? null) as (DeadlineDetail & { windowKey?: string }) | null;
    // A date corrected by hand stands until the person changes it again.
    if (detail?.correctedBy || !countsFromReceipt(d.rule)) continue;
    let r: ResolvedDateDetail | null = null;
    if (window) {
      if (!detail?.windowKey) continue;
      const w = resolveOrderWindow(inOrderWindows, detail.windowKey, {
        ...calendar,
        anchors: orderAnchors(doc),
      });
      if (!isDateError(w)) r = w;
    } else {
      const rule = DateRule.safeParse(d.rule);
      if (!rule.success) continue;
      const res = resolveDate(rule.data, { ...calendar, anchors: findingAnchors(doc) });
      if (!isDateError(res)) r = res;
    }
    if (!r) continue;
    const next = refreshDetail(d.detail ?? null, r, doc.receivedOnAssumed);
    await tx
      .update(deadlines)
      .set({ dueOn: r.dueOn, windowEndOn: r.windowEndOn ?? null, basis: r.basis, detail: next })
      .where(and(eq(deadlines.orgId, actor.orgId), eq(deadlines.id, d.id)));
    await audit.write(tx, scope, {
      actor: actor.userId,
      action: "deadline.recompute",
      targetType: "deadline",
      targetId: d.id,
      requestId: actor.requestId ?? null,
      detail: {
        from: d.dueOn,
        to: r.dueOn,
        windowFrom: d.windowEndOn,
        windowTo: r.windowEndOn ?? null,
        reason,
      },
    });
    changed += 1;
  }
  return changed;
}

/**
 * Set a document's received date, or confirm the assumed one, and recompute
 * what counts from it. Audited with the date before and after. A no-op when
 * the date is already the one given and was not assumed.
 */
export async function applyReceivedDate(
  tx: OrgTx,
  scope: { orgId: string },
  actor: Actor,
  doc: DocumentRow,
  receivedOn: string,
  reason: string,
  cal: OrgCalendar,
): Promise<{ recomputed: number; changed: boolean }> {
  if (doc.receivedOn === receivedOn && !doc.receivedOnAssumed)
    return { recomputed: 0, changed: false };
  await tx
    .update(documents)
    .set({ receivedOn, receivedOnAssumed: false })
    .where(and(eq(documents.orgId, actor.orgId), eq(documents.id, doc.id)));
  await audit.write(tx, scope, {
    actor: actor.userId,
    action: "document.received_date",
    targetType: "document",
    targetId: doc.id,
    requestId: actor.requestId ?? null,
    detail: {
      from: doc.receivedOn,
      to: receivedOn,
      reason,
      ...(doc.receivedOnAssumed ? { wasAssumed: true } : {}),
    },
  });
  const recomputed = await recomputeFromReceipt(
    tx,
    scope,
    actor,
    { ...doc, receivedOn, receivedOnAssumed: false },
    cal,
    doc.receivedOn === receivedOn ? "Received date confirmed" : "Received date corrected",
  );
  return { recomputed, changed: true };
}
