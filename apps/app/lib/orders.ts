/**
 * Deadlines from orders (01 §4): when an order joins a case, core's date
 * engine adds the appeal window from the country pack. The normal last date
 * and the condonation window are two separate dates, each with its rule.
 */
import "server-only";
import { inOrderWindowFor, inOrderWindows, isDateError, resolveOrderWindow } from "@dueproof/core";
import { and, deadlines, documents, eq, type OrgTx, uuidv7 } from "@dueproof/db";
import type { AuthContext } from "./authorize";
import type { OrgCalendar } from "./calendar";
import type { DeadlineDetail } from "./deadline-detail";

/**
 * Which appeal lies from an order, by the kind of notice the case is about
 * and the order's document type. Conservative: null when it is not clear
 * (an appellate, tribunal or court order, or text that names no law). See
 * core's `inOrderWindowFor`.
 */
export function appealWindowKey(noticeType: string | null, docType: string | null): string | null {
  return inOrderWindowFor(noticeType, docType).key;
}

export type OrderWindowOutcome =
  | { added: true; deadlineId: string; dueOn: string; windowEndOn: string | null }
  | { added: false; reason: string };

export async function addOrderWindow(
  tx: OrgTx,
  ctx: AuthContext,
  documentId: string,
  caseRow: {
    id: string;
    clientId: string | null;
    noticeType: string | null;
    ownerUserId: string | null;
  },
  cal: OrgCalendar,
): Promise<OrderWindowOutcome> {
  const [doc] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, documentId)))
    .limit(1);
  if (doc?.role !== "order") return { added: false, reason: "Not an order." };
  const choice = inOrderWindowFor(caseRow.noticeType, doc.docType);
  if (choice.key === null) return { added: false, reason: choice.review };
  const key = choice.key;
  const existing = await tx
    .select({ id: deadlines.id, rule: deadlines.detail })
    .from(deadlines)
    .where(
      and(
        eq(deadlines.orgId, ctx.orgId),
        eq(deadlines.caseId, caseRow.id),
        eq(deadlines.source, "order"),
      ),
    );
  if (
    existing.some(
      (d) =>
        (d.rule as { windowKey?: string; documentId?: string } | null)?.documentId === documentId,
    )
  )
    return { added: false, reason: "The appeal window is already on the case." };
  const r = resolveOrderWindow(inOrderWindows, key, {
    anchors: {
      ...(doc.receivedOn ? { service: doc.receivedOn, receipt: doc.receivedOn } : {}),
      ...(doc.issuedOn ? { order: doc.issuedOn, issue: doc.issuedOn } : {}),
    },
    holidays: cal.holidays,
    workingDays: cal.workingDays,
    locale: cal.locale,
  });
  if (isDateError(r))
    return { added: false, reason: "The appeal window needs the date the order was served." };
  const detail: DeadlineDetail & { windowKey: string; documentId: string } = {
    adjustments: r.adjustments,
    warnings: r.warnings,
    ...(r.windowBasis ? { windowBasis: r.windowBasis } : {}),
    ...(r.originalDueOn ? { originalDueOn: r.originalDueOn } : {}),
    inputs: r.inputs,
    windowKey: key,
    documentId,
  };
  const id = uuidv7();
  await tx.insert(deadlines).values({
    id,
    orgId: ctx.orgId,
    clientId: caseRow.clientId,
    caseId: caseRow.id,
    source: "order",
    title: r.windowRule.title,
    dueOn: r.dueOn,
    windowEndOn: r.windowEndOn ?? null,
    rule: r.rule,
    basis: r.basis,
    detail: { ...detail },
    ownerUserId: caseRow.ownerUserId,
  });
  return { added: true, deadlineId: id, dueOn: r.dueOn, windowEndOn: r.windowEndOn ?? null };
}
