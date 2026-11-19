"use server";
/**
 * Case page actions. Each starts with authorize() against the case's client,
 * runs in withOrg, and is audited. Dates are computed by core; corrections
 * are append-only (the original is kept in finding_edits and the audit).
 */
import { DemandHead, DemandStatus, Id, IsoDate } from "@dueproof/contracts";
import { isDateError, resolveDate } from "@dueproof/core";
import {
  and,
  audit,
  cases,
  comments,
  deadlines,
  demands,
  documents,
  eq,
  findingEdits,
  findings,
  notifications,
  type OrgTx,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { z } from "zod";
import { type ActionResult, runAction } from "@/lib/action";
import { type Action, type AuthContext, authorize } from "@/lib/authorize";
import { loadOrgCalendar, type OrgCalendar } from "@/lib/calendar";
import { requireClient } from "@/lib/client-access";
import { computeDemand, INTEREST_RULES } from "@/lib/demands";
import { badRequest, notFound } from "@/lib/errors";
import { handCorrection } from "@/lib/findings";
import { notifyMentions } from "@/lib/notify";
import { addOrderWindow } from "@/lib/orders";
import { loadPeople, type Person } from "@/lib/org";
import { todayIn } from "@/lib/pipeline/status";
import { applyReceivedDate } from "@/lib/received-date";
import { approveReply, moveStage, STAGES } from "@/lib/stages";

type CaseRow = typeof cases.$inferSelect;
interface OrgFacts {
  cal: OrgCalendar;
  people: Person[];
}

/** Authorise against the case's client, then run in its org-scoped transaction. */
async function withCase<T>(
  caseId: string,
  action: Action,
  fn: (
    tx: OrgTx,
    ctx: AuthContext,
    scope: { orgId: string },
    c: CaseRow,
    org: OrgFacts,
  ) => Promise<T>,
): Promise<T> {
  const id = Id.parse(caseId);
  // First check the action at all, then again with the case's client once it is known.
  const pre = await authorize(action);
  const c = await withOrg(pre.container.database, pre.orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(cases)
      .where(and(eq(cases.orgId, pre.orgId), eq(cases.id, id)))
      .limit(1);
    return row;
  });
  if (!c) throw notFound("That case");
  const ctx = c.clientId ? await authorize(action, { resource: { clientId: c.clientId } }) : pre;
  // Read outside the transaction: PGlite has one connection, so no nested reads inside it.
  const [cal, people] = await Promise.all([
    loadOrgCalendar(ctx.container, ctx.orgId),
    loadPeople(ctx),
  ]);
  return withOrg(ctx.container.database, ctx.orgId, (tx, scope) =>
    fn(tx, ctx, scope, c, { cal, people }),
  );
}

/** Like withCase, for a deadline: authorise against its client before the transaction. */
async function withDeadline<T>(
  deadlineId: string,
  fn: (
    tx: OrgTx,
    ctx: AuthContext,
    scope: { orgId: string },
    d: typeof deadlines.$inferSelect,
  ) => Promise<T>,
): Promise<T> {
  const pre = await authorize("deadline.edit");
  const d = await withOrg(pre.container.database, pre.orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(deadlines)
      .where(and(eq(deadlines.orgId, pre.orgId), eq(deadlines.id, deadlineId)))
      .limit(1);
    return row;
  });
  if (!d) throw notFound("That deadline");
  const ctx = d.clientId
    ? await authorize("deadline.edit", { resource: { clientId: d.clientId } })
    : pre;
  return withOrg(ctx.container.database, ctx.orgId, (tx, scope) => fn(tx, ctx, scope, d));
}

export async function assignCase(input: { caseId: string; ownerUserId: string | null }) {
  return runAction(async () => {
    const owner = input.ownerUserId === null ? null : Id.parse(input.ownerUserId);
    return withCase(input.caseId, "case.assign", async (tx, ctx, scope, c, { people }) => {
      if (owner) {
        if (!people.some((p) => p.id === owner))
          throw badRequest("That person isn't in your organisation.");
      }
      await tx.update(cases).set({ ownerUserId: owner }).where(eq(cases.id, c.id));
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "case.assign",
        targetType: "case",
        targetId: c.id,
        requestId: ctx.requestId,
        detail: { from: c.ownerUserId, to: owner },
      });
      if (owner && owner !== ctx.userId) {
        await tx.insert(notifications).values({
          id: uuidv7(),
          orgId: ctx.orgId,
          userId: owner,
          kind: "case.assigned",
          payload: { caseId: c.id, by: ctx.userId },
        });
      }
      return { ownerUserId: owner };
    });
  });
}

const StageInput = z.object({
  caseId: Id,
  to: z.enum(STAGES),
  reason: z.string().trim().max(500).optional(),
  filingRef: z.string().trim().max(80).optional(),
  filedOn: IsoDate.optional(),
});

export async function changeStage(input: z.input<typeof StageInput>) {
  return runAction(async () => {
    const v = StageInput.parse(input);
    return withCase(v.caseId, "case.change_stage", (tx, ctx, scope, c) =>
      moveStage(tx, ctx, scope, c, {
        to: v.to,
        reason: v.reason,
        filingRef: v.filingRef,
        filedOn: v.filedOn,
      }),
    );
  });
}

/** Partner approval: core's policy decides (may approve replies, not the requester). */
export async function approveCase(caseId: string) {
  return runAction(async () =>
    withCase(caseId, "case.view", async (tx, ctx, scope, c) => {
      await approveReply(tx, ctx, scope, c);
      return { approved: true };
    }),
  );
}

const ReceivedInput = z.object({
  caseId: Id,
  documentId: Id,
  receivedOn: IsoDate,
  reason: z.string().trim().min(1, "Say why the date changes.").max(500),
});

/**
 * Correct (or confirm) the received date (01 §4: editable, with history).
 * Every open deadline of the document that runs from receipt is recomputed
 * by core: the notice's deadlines and an order's appeal window, with their
 * working. Dates corrected by hand stay. Each change is audited with the
 * date before and after (lib/received-date.ts).
 */
export async function correctReceivedDate(input: z.input<typeof ReceivedInput>) {
  return runAction(async () => {
    const v = ReceivedInput.parse(input);
    const out = await withCase(v.caseId, "deadline.edit", async (tx, ctx, scope, c, { cal }) => {
      const [doc] = await tx
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.orgId, ctx.orgId),
            eq(documents.id, v.documentId),
            eq(documents.caseId, c.id),
          ),
        )
        .limit(1);
      if (!doc) throw notFound("That document");
      if (v.receivedOn > todayIn(cal.timezone))
        throw badRequest("The received date can't be in the future.");
      const r = await applyReceivedDate(tx, scope, ctx, doc, v.receivedOn, v.reason, cal);
      return { recomputed: r.recomputed };
    });
    return out;
  });
}

const DueInput = z.object({
  deadlineId: Id,
  dueOn: IsoDate,
  reason: z.string().trim().min(1, "Say why the date changes.").max(500),
});

/**
 * Correct a due date by hand: append-only edit with a reason, the original
 * kept beside it (finding_edits and the audit trail). The date becomes a
 * fixed rule and the old condonation window is cleared, so a later
 * received-date correction leaves it alone (lib/findings.ts handCorrection).
 */
export async function correctDueDate(input: z.input<typeof DueInput>) {
  return runAction(async () => {
    const v = DueInput.parse(input);
    return withDeadline(v.deadlineId, async (tx, ctx, scope, d) => {
      // A statutory date comes from the calendar pack; changing it by hand is an override.
      if (d.source === "statutory")
        requireClient(ctx, "statutory.override", d.clientId, "That deadline");
      const r = resolveDate(
        { type: "fixed", date: v.dueOn },
        { anchors: {}, holidays: [], workingDays: [1, 2, 3, 4, 5, 6, 7] },
      );
      if (isDateError(r)) throw badRequest(r.message);
      if (d.findingId) {
        await tx.insert(findingEdits).values({
          orgId: ctx.orgId,
          findingId: d.findingId,
          actorUserId: ctx.userId,
          field: "due_on",
          before: d.dueOn,
          after: r.dueOn,
          note: v.reason,
        });
      }
      await tx
        .update(deadlines)
        .set(handCorrection(d, r, ctx.userId, `Corrected by hand from ${d.dueOn}: ${v.reason}`))
        .where(eq(deadlines.id, d.id));
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "deadline.correct",
        targetType: "deadline",
        targetId: d.id,
        requestId: ctx.requestId,
        detail: {
          from: d.dueOn,
          to: r.dueOn,
          reason: v.reason,
          ...(d.windowEndOn ? { windowCleared: d.windowEndOn } : {}),
        },
      });
      return { dueOn: r.dueOn };
    });
  });
}

const StatusInput = z.object({ deadlineId: Id, status: z.enum(["open", "done"]) });

export async function setDeadlineStatus(input: z.input<typeof StatusInput>) {
  return runAction(async () => {
    const v = StatusInput.parse(input);
    return withDeadline(v.deadlineId, async (tx, ctx, scope, d) => {
      await tx
        .update(deadlines)
        .set({ status: v.status, completedAt: v.status === "done" ? new Date() : null })
        .where(eq(deadlines.id, d.id));
      if (d.findingId)
        await tx.update(findings).set({ status: v.status }).where(eq(findings.id, d.findingId));
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "deadline.status",
        targetType: "deadline",
        targetId: d.id,
        requestId: ctx.requestId,
        detail: { from: d.status, to: v.status },
      });
      return { status: v.status };
    });
  });
}

const ManualInput = z.object({
  caseId: Id,
  title: z.string().trim().min(1, "Say what is due.").max(200),
  dueOn: IsoDate,
});

/** "No deadline found": a person adds it by hand (origin human, source manual). */
export async function addManualDeadline(input: z.input<typeof ManualInput>) {
  return runAction(async () => {
    const v = ManualInput.parse(input);
    return withCase(v.caseId, "deadline.edit", async (tx, ctx, scope, c) => {
      const rule = { type: "fixed" as const, date: v.dueOn };
      const r = resolveDate(rule, {
        anchors: {},
        holidays: [],
        workingDays: [1, 2, 3, 4, 5, 6, 7],
      });
      if (isDateError(r)) throw badRequest(r.message);
      const id = uuidv7();
      await tx.insert(deadlines).values({
        id,
        orgId: ctx.orgId,
        clientId: c.clientId,
        caseId: c.id,
        source: "manual",
        title: v.title,
        dueOn: r.dueOn,
        rule: r.rule,
        basis: "Added by hand",
        detail: { adjustments: [], warnings: [], origin: "human", addedBy: ctx.userId },
        ownerUserId: c.ownerUserId,
      });
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "deadline.create",
        targetType: "deadline",
        targetId: id,
        requestId: ctx.requestId,
        detail: { caseId: c.id, dueOn: r.dueOn },
      });
      return { deadlineId: id };
    });
  });
}

export async function addAppealWindow(input: { caseId: string; documentId: string }) {
  return runAction(async () => {
    const documentId = Id.parse(input.documentId);
    return withCase(input.caseId, "deadline.edit", async (tx, ctx, scope, c, org) => {
      const r = await addOrderWindow(tx, ctx, documentId, c, org.cal);
      if (!r.added) throw badRequest(r.reason);
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "case.appeal_window",
        targetType: "case",
        targetId: c.id,
        requestId: ctx.requestId,
        detail: { documentId, deadlineId: r.deadlineId },
      });
      return r;
    });
  });
}

const CommentInput = z.object({
  caseId: Id,
  text: z.string().trim().min(1, "Write something first.").max(5000),
  mentionIds: z.array(Id).max(20).default([]),
});

/** A comment; each @mention gets an in-app notification (payload has ids only, never the text). */
export async function addComment(input: z.input<typeof CommentInput>) {
  return runAction(async () => {
    const v = CommentInput.parse(input);
    const done = await withCase(v.caseId, "case.comment", async (tx, ctx, scope, c, org) => {
      const people = new Set(org.people.map((p) => p.id));
      const mentions = [...new Set(v.mentionIds)].filter((m) => people.has(m));
      const id = uuidv7();
      await tx.insert(comments).values({
        id,
        orgId: ctx.orgId,
        caseId: c.id,
        authorUserId: ctx.userId,
        body: v.text,
        mentions,
      });
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "case.comment",
        targetType: "case",
        targetId: c.id,
        requestId: ctx.requestId,
        detail: { commentId: id, mentions: mentions.length },
      });
      return { commentId: id, ctx, caseTitle: c.reference ?? c.title, mentions };
    });
    // After the commit: notify() opens its own org-scoped transaction (and may send a push).
    const notified = await notifyMentions(done.ctx.container, done.ctx.orgId, {
      id: done.commentId,
      caseId: v.caseId,
      caseTitle: done.caseTitle,
      mentions: done.mentions,
      authorUserId: done.ctx.userId,
    });
    return { commentId: done.commentId, notified };
  });
}

const DemandInput = z.object({
  caseId: Id,
  demandId: Id.optional(),
  taxType: z.enum(["gst", "income_tax", "tds", "other"]),
  head: DemandHead.default("tax"),
  status: DemandStatus.default("open"),
  principalMinor: z.number().int().positive("Enter the amount demanded."),
  findingId: Id.optional(),
  interestRule: z.enum(INTEREST_RULES.map((r) => r.key) as [string, ...string[]]).optional(),
  penaltyRule: z.string().max(60).optional(),
  dueOn: IsoDate.optional(),
  asOf: IsoDate.optional(),
});

/**
 * Enter or confirm a demand as stated, and the inputs for interest and the
 * penalty range. The figures are computed by core and stored with their
 * inputs (an estimate, not advice).
 */
export async function saveDemand(input: z.input<typeof DemandInput>) {
  return runAction(async () => {
    const v = DemandInput.parse(input);
    return withCase(v.caseId, "case.edit", async (tx, ctx, scope, c, { cal }) => {
      const asOf = v.asOf ?? todayIn(cal.timezone);
      if (v.interestRule && !v.dueOn)
        throw badRequest("Enter the date the tax was due, to compute interest.");
      const inputs = {
        ...(v.dueOn ? { dueOn: v.dueOn } : {}),
        asOf,
        ...(v.penaltyRule ? { penaltyRule: v.penaltyRule } : {}),
      };
      const comp = computeDemand(
        v.principalMinor,
        v.interestRule ?? null,
        v.penaltyRule ?? null,
        inputs,
        cal.locale,
      );
      if (comp.error) throw badRequest(comp.error);
      const values = {
        orgId: ctx.orgId,
        caseId: c.id,
        clientId: c.clientId,
        findingId: v.findingId ?? null,
        taxType: v.taxType,
        head: v.head,
        status: v.status,
        principalMinor: v.principalMinor,
        interestRule: v.interestRule ?? null,
        inputs,
        interestMinor: comp.interest?.amountMinor ?? null,
        penaltyMinMinor: comp.penalty?.lowMinor ?? null,
        penaltyMaxMinor: comp.penalty?.highMinor ?? null,
        asOf,
      };
      let id = v.demandId;
      if (id) {
        const [prev] = await tx
          .select({ id: demands.id })
          .from(demands)
          .where(and(eq(demands.orgId, ctx.orgId), eq(demands.id, id), eq(demands.caseId, c.id)))
          .limit(1);
        if (!prev) throw notFound("That demand");
        await tx.update(demands).set(values).where(eq(demands.id, id));
      } else {
        id = uuidv7();
        await tx.insert(demands).values({ id, ...values });
      }
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "demand.save",
        targetType: "demand",
        targetId: id,
        requestId: ctx.requestId,
        detail: {
          principalMinor: v.principalMinor,
          interestMinor: values.interestMinor,
          status: v.status,
          rule: v.interestRule ?? null,
        },
      });
      return { demandId: id, interestMinor: values.interestMinor };
    });
  });
}

export type CaseActionResult = ActionResult<unknown>;
