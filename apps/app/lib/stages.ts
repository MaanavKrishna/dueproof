/**
 * The case stage bar (01 §4). A person moves the stage; every move is
 * audited (the audit trail is the case's stage history). Skipping ahead or
 * going back needs a reason. Two stages have conditions:
 *
 * - Partner approval: moving to "approval" asks for it; approving needs
 *   "may approve replies" and is never by the person who asked (core's
 *   policy, `reply.approve` with `requestedBy`).
 * - Filed on portal: needs the acknowledgement or ARN number and an
 *   uploaded acknowledgement in the thread. Dueproof never files anything.
 */
import "server-only";
import { CaseStage } from "@dueproof/contracts";
import { can } from "@dueproof/core";
import { and, audit, cases, desc, documents, eq, type OrgTx, schema } from "@dueproof/db";

const auditLog = schema.audit;

import type { AuthContext } from "./authorize";
import { badRequest, forbidden, HttpError } from "./errors";

export const STAGES = CaseStage.options;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  received: "Received",
  gathering: "Documents gathered",
  drafting: "Draft reply",
  approval: "Partner approval",
  filed: "Filed on portal",
  order: "Order received",
  appeal: "Appeal",
  closed: "Closed",
};

type CaseRow = typeof cases.$inferSelect;

/** Who asked for the current approval: the actor who last moved the case into "approval". */
export async function approvalRequester(
  tx: OrgTx,
  orgId: string,
  caseId: string,
): Promise<string | null> {
  const rows = await tx
    .select({ actor: auditLog.actor, detail: auditLog.detail })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.orgId, orgId),
        eq(auditLog.targetType, "case"),
        eq(auditLog.targetId, caseId),
        eq(auditLog.action, "case.stage"),
      ),
    )
    .orderBy(desc(auditLog.id))
    .limit(50);
  for (const r of rows) {
    if ((r.detail as { to?: string } | null)?.to === "approval") return r.actor;
  }
  return null;
}

export interface StageChange {
  to: Stage;
  reason?: string | undefined;
  filingRef?: string | undefined;
  filedOn?: string | undefined;
}

/** Whether a move needs a reason: anything but the next stage. */
export function needsReason(from: Stage, to: Stage): boolean {
  return STAGES.indexOf(to) !== STAGES.indexOf(from) + 1;
}

export async function moveStage(
  tx: OrgTx,
  ctx: AuthContext,
  scope: { orgId: string },
  c: CaseRow,
  change: StageChange,
): Promise<{ from: Stage; to: Stage }> {
  const from = c.stage as Stage;
  const { to } = change;
  if (from === to) return { from, to };
  const reason = change.reason?.trim();
  if (needsReason(from, to) && !reason)
    throw badRequest("Say why the case skips a stage or goes back.", "reason_required");

  const set: Partial<typeof cases.$inferInsert> = { stage: to };
  if (
    to === "approval" &&
    !can(ctx, "reply.request_approval", c.clientId ? { clientId: c.clientId } : {})
  )
    throw forbidden();
  if (
    from === "approval" &&
    STAGES.indexOf(to) > STAGES.indexOf("approval") &&
    !c.approvedByUserId &&
    !reason
  )
    throw new HttpError(
      409,
      "The reply isn't approved yet. Approve it, or give a reason to go on without.",
      "not_approved",
    );
  if (to === "filed") {
    const ref = change.filingRef?.trim();
    if (!ref) throw badRequest("Enter the acknowledgement or ARN number.", "filing_ref_required");
    const [ack] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.orgId, ctx.orgId),
          eq(documents.caseId, c.id),
          eq(documents.role, "acknowledgement"),
        ),
      )
      .limit(1);
    if (!ack)
      throw new HttpError(409, "Upload the acknowledgement to the thread first.", "ack_required");
    set.filingRef = ref;
    set.filedOn = change.filedOn ?? null;
  }
  if (to === "approval") set.approvedByUserId = null;
  if (to === "closed") set.closedAt = new Date();
  else if (from === "closed") set.closedAt = null;

  await tx
    .update(cases)
    .set(set)
    .where(and(eq(cases.orgId, ctx.orgId), eq(cases.id, c.id)));
  await audit.write(tx, scope, {
    actor: ctx.userId,
    action: "case.stage",
    targetType: "case",
    targetId: c.id,
    requestId: ctx.requestId,
    detail: {
      from,
      to,
      reason: reason ?? null,
      ...(to === "filed" ? { filingRef: set.filingRef } : {}),
    },
  });
  return { from, to };
}

/** Approve the reply: may approve replies, and not the person who asked (D-prod-2). */
export async function approveReply(
  tx: OrgTx,
  ctx: AuthContext,
  scope: { orgId: string },
  c: CaseRow,
) {
  if (c.stage !== "approval")
    throw new HttpError(409, "Nobody has asked for approval on this case.", "wrong_state");
  const requestedBy = await approvalRequester(tx, ctx.orgId, c.id);
  if (
    !can(ctx, "reply.approve", {
      ...(requestedBy ? { requestedBy } : {}),
      ...(c.clientId ? { clientId: c.clientId } : {}),
    })
  ) {
    throw forbidden(
      requestedBy === ctx.userId
        ? "You asked for this approval, so someone else must give it."
        : "You can't approve replies. Ask a partner who can.",
    );
  }
  await tx
    .update(cases)
    .set({ approvedByUserId: ctx.userId })
    .where(and(eq(cases.orgId, ctx.orgId), eq(cases.id, c.id)));
  await audit.write(tx, scope, {
    actor: ctx.userId,
    action: "case.approve",
    targetType: "case",
    targetId: c.id,
    requestId: ctx.requestId,
    detail: { requestedBy },
  });
}
