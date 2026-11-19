/**
 * Review-and-confirm (02 §11) for findings, shared by the Inbox queue and
 * the case page. Every change is written to `finding_edits` (append-only:
 * corrections sit beside what was found) and to the audit trail. A finding
 * becomes a deadline only here or in the pipeline, and its date comes only
 * from core's date engine (house rules 2 and 3).
 */
import "server-only";
import { DateRule, Id, IsoDate } from "@dueproof/contracts";
import {
  type DateContext,
  isDateError,
  type ResolvedDateDetail,
  resolveDate,
} from "@dueproof/core";
import {
  and,
  audit,
  deadlines,
  documents,
  eq,
  findingEdits,
  findings,
  type OrgTx,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { z } from "zod";
import type { AuthContext } from "./authorize";
import { loadOrgCalendar } from "./calendar";
import { requireClient } from "./client-access";
import type { DeadlineDetail } from "./deadline-detail";
import { defaultOwner, ownerDetail } from "./deadline-owner";
import { badRequest, HttpError, notFound } from "./errors";
import { findingAnchors, flagAssumed, restsOnAssumedReceipt } from "./received-date";

export interface ReviewOutcome {
  findingId: string;
  deadlineId?: string;
  dueOn?: string;
  /** A plain note when the date couldn't be computed yet ("needs receipt date"). */
  note?: string;
}

/** Load a finding for review, limited to the caller's clients (its document's client). */
async function loadFinding(tx: OrgTx, ctx: AuthContext, findingId: string) {
  const [row] = await tx
    .select({ f: findings, clientId: documents.clientId })
    .from(findings)
    .innerJoin(
      documents,
      and(eq(documents.orgId, findings.orgId), eq(documents.id, findings.documentId)),
    )
    .where(and(eq(findings.orgId, ctx.orgId), eq(findings.id, findingId)))
    .limit(1);
  if (!row) throw notFound("That finding");
  requireClient(ctx, "finding.review", row.clientId, "That finding");
  return row.f;
}

async function writeEdit(
  tx: OrgTx,
  ctx: AuthContext,
  findingId: string,
  field: string,
  before: unknown,
  after: unknown,
  note: string | null = null,
) {
  await tx.insert(findingEdits).values({
    orgId: ctx.orgId,
    findingId,
    actorUserId: ctx.userId,
    field,
    before: before === undefined ? null : (before as object),
    after: after === undefined ? null : (after as object),
    note,
  });
}

/** Turn a confirmed finding's date rule into a deadline, if it has one and none exists. */
async function ensureDeadline(
  tx: OrgTx,
  ctx: AuthContext,
  finding: typeof findings.$inferSelect,
  dateContext: Omit<DateContext, "anchors">,
): Promise<Pick<ReviewOutcome, "deadlineId" | "dueOn" | "note">> {
  if (!finding.dueRule) return {};
  const [existing] = await tx
    .select({ id: deadlines.id, dueOn: deadlines.dueOn })
    .from(deadlines)
    .where(and(eq(deadlines.orgId, ctx.orgId), eq(deadlines.findingId, finding.id)))
    .limit(1);
  if (existing) return { deadlineId: existing.id, dueOn: existing.dueOn };
  const rule = DateRule.safeParse(finding.dueRule);
  if (!rule.success) return { note: "The date rule couldn't be read; add the date by hand." };
  const [doc] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, finding.documentId)))
    .limit(1);
  if (!doc) throw notFound("That document");
  const resolved = resolveDate(rule.data, { ...dateContext, anchors: findingAnchors(doc) });
  if (isDateError(resolved)) {
    return {
      note:
        resolved.error === "missing_anchor"
          ? "Confirmed. The due date needs the receipt date: enter it on the case."
          : "Confirmed. The due date couldn't be computed; add it by hand.",
    };
  }
  // The finding's owner if it has one, else the default (lib/deadline-owner.ts).
  const auto = finding.ownerUserId
    ? { userId: finding.ownerUserId, from: null }
    : await defaultOwner(tx, ctx.orgId, doc);
  const detail: DeadlineDetail = flagAssumed(
    {
      adjustments: resolved.adjustments,
      warnings: resolved.warnings,
      ...(resolved.windowBasis ? { windowBasis: resolved.windowBasis } : {}),
      ...(resolved.originalDueOn ? { originalDueOn: resolved.originalDueOn } : {}),
      inputs: resolved.inputs,
      origin: finding.origin,
      verification: finding.verification,
      ...ownerDetail(auto),
    },
    restsOnAssumedReceipt(doc, resolved.rule),
  );
  const id = uuidv7();
  await tx.insert(deadlines).values({
    id,
    orgId: ctx.orgId,
    clientId: doc.clientId,
    caseId: doc.caseId,
    findingId: finding.id,
    source: doc.role === "order" ? "order" : "notice",
    title: (finding.textEn ?? finding.text).slice(0, 200),
    dueOn: resolved.dueOn,
    windowEndOn: resolved.windowEndOn ?? null,
    rule: resolved.rule,
    basis: resolved.basis,
    detail: { ...detail },
    ownerUserId: auto.userId,
  });
  return { deadlineId: id, dueOn: resolved.dueOn };
}

/**
 * The new state of a deadline whose date a person corrected (M4). The date
 * becomes a fixed rule, so a later received-date correction can't move it;
 * the condonation window that came with the old relative rule is cleared,
 * with its basis and the "received date assumed" flag; the date before the
 * first correction is kept as `originalDueOn`.
 */
export function handCorrection(
  d: typeof deadlines.$inferSelect,
  r: ResolvedDateDetail,
  userId: string,
  basis: string,
) {
  const old = (d.detail ?? {}) as DeadlineDetail & Record<string, unknown>;
  const { windowBasis: _w, receivedOnAssumed: _r, ...keep } = old;
  const detail: Record<string, unknown> = {
    ...keep,
    adjustments: r.adjustments,
    warnings: r.warnings,
    inputs: r.inputs,
    originalDueOn: old.originalDueOn ?? d.dueOn,
    correctedBy: userId,
    correctedAt: new Date().toISOString(),
  };
  return { dueOn: r.dueOn, windowEndOn: null, rule: r.rule, basis, detail };
}

async function calendarContext(ctx: AuthContext): Promise<Omit<DateContext, "anchors">> {
  const cal = await loadOrgCalendar(ctx.container, ctx.orgId);
  return { holidays: cal.holidays, workingDays: cal.workingDays, locale: cal.locale };
}

export async function confirmFinding(ctx: AuthContext, rawId: string): Promise<ReviewOutcome> {
  const findingId = Id.parse(rawId);
  const dates = await calendarContext(ctx);
  return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    const f = await loadFinding(tx, ctx, findingId);
    if (f.status === "dismissed")
      throw new HttpError(409, "This finding was dismissed. Restore it first.", "wrong_state");
    await writeEdit(
      tx,
      ctx,
      f.id,
      "review",
      f.confirmedBy ? "confirmed" : "needs_review",
      "confirmed",
    );
    await tx
      .update(findings)
      .set({ confirmedBy: ctx.userId })
      .where(and(eq(findings.orgId, ctx.orgId), eq(findings.id, f.id)));
    const outcome = await ensureDeadline(tx, ctx, { ...f, confirmedBy: ctx.userId }, dates);
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "finding.confirm",
      targetType: "finding",
      targetId: f.id,
      requestId: ctx.requestId,
      detail: { deadlineId: outcome.deadlineId ?? null, dueOn: outcome.dueOn ?? null },
    });
    return { findingId: f.id, ...outcome };
  });
}

export const DismissInput = z.object({
  findingId: Id,
  reason: z.string().trim().max(500).optional(),
});

export async function dismissFinding(
  ctx: AuthContext,
  input: z.input<typeof DismissInput>,
): Promise<ReviewOutcome> {
  const { findingId, reason } = DismissInput.parse(input);
  return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    const f = await loadFinding(tx, ctx, findingId);
    await writeEdit(tx, ctx, f.id, "status", f.status, "dismissed", reason ?? null);
    await tx
      .update(findings)
      .set({ status: "dismissed" })
      .where(and(eq(findings.orgId, ctx.orgId), eq(findings.id, f.id)));
    // A dismissed finding's deadline is dismissed with it (kept, not deleted).
    await tx
      .update(deadlines)
      .set({ status: "dismissed" })
      .where(and(eq(deadlines.orgId, ctx.orgId), eq(deadlines.findingId, f.id)));
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "finding.dismiss",
      targetType: "finding",
      targetId: f.id,
      requestId: ctx.requestId,
      detail: { reason: reason ?? null },
    });
    return { findingId: f.id };
  });
}

/** Undo a dismissal (the toast's Undo). */
export async function restoreFinding(ctx: AuthContext, rawId: string): Promise<ReviewOutcome> {
  const findingId = Id.parse(rawId);
  return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    const f = await loadFinding(tx, ctx, findingId);
    if (f.status !== "dismissed") return { findingId };
    await writeEdit(tx, ctx, f.id, "status", "dismissed", "open", "Undone");
    await tx
      .update(findings)
      .set({ status: "open" })
      .where(and(eq(findings.orgId, ctx.orgId), eq(findings.id, f.id)));
    await tx
      .update(deadlines)
      .set({ status: "open" })
      .where(and(eq(deadlines.orgId, ctx.orgId), eq(deadlines.findingId, f.id)));
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "finding.restore",
      targetType: "finding",
      targetId: f.id,
      requestId: ctx.requestId,
    });
    return { findingId };
  });
}

export const EditInput = z.object({
  findingId: Id,
  text: z.string().trim().min(1, "Say what must happen.").max(1000).optional(),
  /** A date a person read on the page: it becomes a fixed date rule, computed by core. */
  dueOn: IsoDate.optional(),
  amountMinor: z.number().int().nonnegative().optional(),
  note: z.string().trim().min(1, "Give a reason for the change.").max(500),
});

/** Correct a finding; the person's version sits beside the original in finding_edits. Editing confirms it. */
export async function editFinding(
  ctx: AuthContext,
  input: z.input<typeof EditInput>,
): Promise<ReviewOutcome> {
  const e = EditInput.parse(input);
  if (e.text === undefined && e.dueOn === undefined && e.amountMinor === undefined)
    throw badRequest("Change something, or confirm it as it is.");
  const dates = await calendarContext(ctx);
  return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    const f = await loadFinding(tx, ctx, e.findingId);
    const set: Partial<typeof findings.$inferInsert> = { confirmedBy: ctx.userId };
    const changed: string[] = [];
    if (e.text !== undefined && e.text !== (f.textEn ?? f.text)) {
      await writeEdit(tx, ctx, f.id, "text", f.textEn ?? f.text, e.text, e.note);
      set[f.textEn ? "textEn" : "text"] = e.text;
      changed.push("text");
    }
    let dueChanged = false;
    if (e.dueOn !== undefined) {
      const rule = { type: "fixed", date: e.dueOn } as const;
      await writeEdit(tx, ctx, f.id, "due_rule", f.dueRule, rule, e.note);
      set.dueRule = rule;
      dueChanged = true;
      changed.push("due");
    }
    if (e.amountMinor !== undefined && e.amountMinor !== f.amountMinor) {
      await writeEdit(tx, ctx, f.id, "amount_minor", f.amountMinor, e.amountMinor, e.note);
      set.amountMinor = e.amountMinor;
      changed.push("amount");
    }
    await writeEdit(
      tx,
      ctx,
      f.id,
      "review",
      f.confirmedBy ? "confirmed" : "needs_review",
      "confirmed",
      e.note,
    );
    await tx
      .update(findings)
      .set(set)
      .where(and(eq(findings.orgId, ctx.orgId), eq(findings.id, f.id)));
    const updated = { ...f, ...set } as typeof findings.$inferSelect;
    let outcome: Pick<ReviewOutcome, "deadlineId" | "dueOn" | "note"> = {};
    if (dueChanged) {
      // A corrected date replaces the computed one on an existing deadline; the old value is in finding_edits.
      const [existing] = await tx
        .select()
        .from(deadlines)
        .where(and(eq(deadlines.orgId, ctx.orgId), eq(deadlines.findingId, f.id)))
        .limit(1);
      if (existing) {
        const r = resolveDate(set.dueRule as DateRule, { ...dates, anchors: {} });
        if (!isDateError(r)) {
          await tx
            .update(deadlines)
            .set(handCorrection(existing, r, ctx.userId, `Corrected by hand: ${e.note}`))
            .where(eq(deadlines.id, existing.id));
          await audit.write(tx, scope, {
            actor: ctx.userId,
            action: "deadline.correct",
            targetType: "deadline",
            targetId: existing.id,
            requestId: ctx.requestId,
            detail: { from: existing.dueOn, to: r.dueOn, reason: e.note, findingId: f.id },
          });
          outcome = { deadlineId: existing.id, dueOn: r.dueOn };
        }
      } else outcome = await ensureDeadline(tx, ctx, updated, dates);
    } else outcome = await ensureDeadline(tx, ctx, updated, dates);
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "finding.edit",
      targetType: "finding",
      targetId: f.id,
      requestId: ctx.requestId,
      detail: { fields: changed, deadlineId: outcome.deadlineId ?? null },
    });
    return { findingId: f.id, ...outcome };
  });
}
