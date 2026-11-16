"use server";
/**
 * Server actions for Deadlines: mark done (and undo), reassign, snooze,
 * add a deadline by hand, and the calendar feed. Each starts with
 * `authorize()`, works in one org-scoped transaction and writes an audit row.
 * Dates for manual deadlines come from core's date engine.
 */
import { listOrgPeople } from "@dueproof/auth";
import {
  authorize as checkPolicy,
  isDateError,
  isValidIsoDate,
  PolicyDenied,
  resolveDate,
} from "@dueproof/core";
import { and, audit, cases, clients, deadlines, eq, uuidv7, withOrg } from "@dueproof/db";
import { type ActionResult, runAction } from "@/lib/action";
import { type AuthContext, authorize } from "@/lib/authorize";
import { loadOrgCalendar } from "@/lib/calendar";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { notify } from "@/lib/notify";
import { type FeedScope, signFeedToken } from "./ical";

type Snapshot = {
  id: string;
  status: "open" | "done" | "dismissed";
  ownerUserId: string | null;
  snoozedUntil: string | null;
};

async function loadForEdit(ctx: AuthContext, id: string) {
  if (typeof id !== "string" || !id) throw badRequest("Choose a deadline.");
  const row = await withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const [d] = await tx
      .select()
      .from(deadlines)
      .where(and(eq(deadlines.orgId, ctx.orgId), eq(deadlines.id, id)))
      .limit(1);
    return d;
  });
  if (!row) throw notFound("That deadline");
  try {
    checkPolicy(ctx, "deadline.edit", row.clientId ? { clientId: row.clientId } : undefined);
  } catch (e) {
    if (e instanceof PolicyDenied) throw forbidden();
    throw e;
  }
  return row;
}

function snapshot(row: typeof deadlines.$inferSelect): Snapshot {
  const detail = (row.detail ?? {}) as { snoozedUntil?: string };
  return {
    id: row.id,
    status: row.status,
    ownerUserId: row.ownerUserId,
    snoozedUntil: detail.snoozedUntil ?? null,
  };
}

async function update(
  ctx: AuthContext,
  id: string,
  values: Partial<typeof deadlines.$inferInsert>,
  action: string,
  detail: Record<string, unknown>,
) {
  await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    await tx
      .update(deadlines)
      .set(values)
      .where(and(eq(deadlines.orgId, ctx.orgId), eq(deadlines.id, id)));
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action,
      targetType: "deadline",
      targetId: id,
      requestId: ctx.requestId,
      detail,
    });
  });
}

/** Mark a deadline done, with an optional acknowledgement / ARN number. Returns the state to undo to. */
export async function markDeadlineDone(
  id: string,
  ackNumber?: string,
): Promise<ActionResult<Snapshot>> {
  return runAction("markDeadlineDone", async () => {
    const ctx = await authorize("deadline.edit");
    const row = await loadForEdit(ctx, id);
    const ack = typeof ackNumber === "string" ? ackNumber.trim().slice(0, 64) : "";
    const detail = { ...(row.detail ?? {}), ...(ack ? { ackNumber: ack } : {}) };
    await update(ctx, id, { status: "done", completedAt: new Date(), detail }, "deadline.done", {
      ack: Boolean(ack),
    });
    return snapshot(row);
  });
}

/** Put a deadline back as it was (the undo for done, dismiss, snooze and reassign). */
export async function restoreDeadline(prev: Snapshot): Promise<ActionResult<null>> {
  return runAction("restoreDeadline", async () => {
    const ctx = await authorize("deadline.edit");
    const row = await loadForEdit(ctx, prev?.id);
    const status = (["open", "done", "dismissed"] as const).includes(prev.status)
      ? prev.status
      : "open";
    const { snoozedUntil: _s, ...rest } = (row.detail ?? {}) as Record<string, unknown>;
    const detail =
      prev.snoozedUntil && isValidIsoDate(prev.snoozedUntil)
        ? { ...rest, snoozedUntil: prev.snoozedUntil }
        : rest;
    await update(
      ctx,
      row.id,
      {
        status,
        completedAt: status === "open" ? null : row.completedAt,
        ownerUserId: prev.ownerUserId ?? null,
        detail,
      },
      "deadline.restored",
      { status },
    );
    return null;
  });
}

/** Dismiss a deadline that doesn't apply (it stays in history). */
export async function dismissDeadline(id: string): Promise<ActionResult<Snapshot>> {
  return runAction("dismissDeadline", async () => {
    const ctx = await authorize("deadline.edit");
    const row = await loadForEdit(ctx, id);
    await update(
      ctx,
      id,
      { status: "dismissed", completedAt: new Date() },
      "deadline.dismissed",
      {},
    );
    return snapshot(row);
  });
}

/** Give a deadline to someone (or nobody). They get a notification. */
export async function reassignDeadline(
  id: string,
  ownerUserId: string | null,
): Promise<ActionResult<Snapshot>> {
  return runAction("reassignDeadline", async () => {
    const ctx = await authorize("deadline.edit");
    const row = await loadForEdit(ctx, id);
    if (ownerUserId !== null) {
      const people = await listOrgPeople(ctx.container.database, ctx.orgId);
      if (!people.some((p) => p.userId === ownerUserId))
        throw badRequest("That person isn't in this organisation.");
    }
    await update(ctx, id, { ownerUserId }, "deadline.assigned", { to: ownerUserId });
    if (ownerUserId && ownerUserId !== ctx.userId) {
      await notify(ctx.container, ctx.orgId, {
        userId: ownerUserId,
        kind: "deadline.assigned",
        key: `assigned:${id}:${ownerUserId}:${Date.now()}`,
        payload: { title: `Assigned to you: ${row.title}`, href: "/deadlines", deadlineId: id },
      });
    }
    return snapshot(row);
  });
}

/** Hide a deadline from the open list until a date (null clears it). */
export async function snoozeDeadline(
  id: string,
  until: string | null,
): Promise<ActionResult<Snapshot>> {
  return runAction("snoozeDeadline", async () => {
    const ctx = await authorize("deadline.edit");
    if (until !== null && (typeof until !== "string" || !isValidIsoDate(until)))
      throw badRequest("Choose a date to snooze until.");
    const row = await loadForEdit(ctx, id);
    const { snoozedUntil: _s, ...rest } = (row.detail ?? {}) as Record<string, unknown>;
    await update(
      ctx,
      id,
      { detail: until ? { ...rest, snoozedUntil: until } : rest },
      "deadline.snoozed",
      { until },
    );
    return snapshot(row);
  });
}

export interface ManualDeadlineInput {
  title: string;
  dueOn: string;
  clientId?: string | null;
  caseId?: string | null;
  ownerUserId?: string | null;
  /** Why this date, in the person's words: "Agreed with the officer by phone". */
  note?: string;
}

/** Add a deadline by hand (origin human). The date engine writes its basis. */
export async function addManualDeadline(
  input: ManualDeadlineInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction("addManualDeadline", async () => {
    const ctx = await authorize(
      "deadline.edit",
      input?.clientId ? { resource: { clientId: input.clientId } } : {},
    );
    const title = typeof input?.title === "string" ? input.title.trim() : "";
    if (!title) throw badRequest("Give the deadline a title.");
    if (title.length > 200) throw badRequest("Keep the title under 200 characters.");
    if (!isValidIsoDate(input.dueOn)) throw badRequest("Choose a due date.");
    const cal = await loadOrgCalendar(ctx.container, ctx.orgId);
    const rule = { type: "fixed" as const, date: input.dueOn };
    const resolved = resolveDate(rule, {
      anchors: {},
      holidays: cal.holidays,
      workingDays: cal.workingDays,
      locale: cal.locale,
    });
    if (isDateError(resolved)) throw badRequest(resolved.message);
    const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
    const id = uuidv7();
    await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      let clientId = input.clientId ?? null;
      if (input.caseId) {
        const [c] = await tx
          .select({ id: cases.id, clientId: cases.clientId })
          .from(cases)
          .where(and(eq(cases.orgId, ctx.orgId), eq(cases.id, input.caseId)))
          .limit(1);
        if (!c) throw notFound("That case");
        clientId = clientId ?? c.clientId;
      }
      if (clientId) {
        const [c] = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(and(eq(clients.orgId, ctx.orgId), eq(clients.id, clientId)))
          .limit(1);
        if (!c) throw notFound("That client");
      }
      await tx.insert(deadlines).values({
        id,
        orgId: ctx.orgId,
        clientId,
        caseId: input.caseId ?? null,
        source: "manual",
        title,
        dueOn: resolved.dueOn,
        rule,
        basis: note ? `${resolved.basis} · ${note}` : `${resolved.basis}, added by hand`,
        detail: {
          adjustments: resolved.adjustments,
          warnings: resolved.warnings,
          inputs: resolved.inputs,
          origin: "human",
        },
        ownerUserId: input.ownerUserId ?? null,
      });
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "deadline.created",
        targetType: "deadline",
        targetId: id,
        requestId: ctx.requestId,
        detail: { source: "manual", dueOn: resolved.dueOn },
      });
    });
    return { id };
  });
}

/** A private calendar feed URL for this person ("me") or the whole organisation ("org"). */
export async function createCalendarFeed(scope: FeedScope): Promise<ActionResult<{ url: string }>> {
  return runAction("createCalendarFeed", async () => {
    const ctx = await authorize("case.view");
    if (scope !== "me" && scope !== "org") throw badRequest("Choose whose deadlines to include.");
    const token = signFeedToken(ctx.container.env.AUTH_SECRET, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      scope,
      issuedAt: Date.now(),
    });
    await withOrg(ctx.container.database, ctx.orgId, (tx, s) =>
      audit.write(tx, s, {
        actor: ctx.userId,
        action: "calendar.feed_created",
        targetType: "user",
        targetId: ctx.userId,
        requestId: ctx.requestId,
        detail: { scope },
      }),
    );
    return { url: new URL(`/api/v1/calendar/${token}.ics`, ctx.container.env.APP_URL).toString() };
  });
}

/** Stop every calendar feed URL this person was given. */
export async function revokeCalendarFeeds(): Promise<ActionResult<null>> {
  return runAction("revokeCalendarFeeds", async () => {
    const ctx = await authorize("case.view");
    await withOrg(ctx.container.database, ctx.orgId, (tx, s) =>
      audit.write(tx, s, {
        actor: ctx.userId,
        action: "calendar.feed_revoked",
        targetType: "user",
        targetId: ctx.userId,
        requestId: ctx.requestId,
      }),
    );
    return null;
  });
}
