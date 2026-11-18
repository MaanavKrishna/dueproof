/**
 * Who owns a deadline the app creates (from a notice, an order or a
 * confirmed finding), so the daily job has someone to remind:
 *
 *   1. the case owner, when the document is in a case with an owner;
 *   2. else the client's partner (the person assigned to the client);
 *   3. else the person who uploaded the document.
 *
 * The choice is recorded in `detail.ownerFrom` and `detail.autoOwner`. When
 * the document is later filed into a case with an owner, a deadline still
 * held by its automatic owner moves to the case owner; one reassigned by
 * hand stays where it is. Deadlines with no owner at all (statutory items,
 * older rows) are reminded to the managers by the daily job.
 */
import "server-only";
import { and, cases, clients, deadlines, eq, findings, type OrgTx } from "@dueproof/db";
import type { DeadlineDetail } from "./deadline-detail";

export interface DefaultOwner {
  userId: string | null;
  from: NonNullable<DeadlineDetail["ownerFrom"]> | null;
}

export async function defaultOwner(
  tx: OrgTx,
  orgId: string,
  doc: { caseId: string | null; clientId: string | null; uploadedBy: string | null },
): Promise<DefaultOwner> {
  if (doc.caseId) {
    const [c] = await tx
      .select({ owner: cases.ownerUserId })
      .from(cases)
      .where(and(eq(cases.orgId, orgId), eq(cases.id, doc.caseId)))
      .limit(1);
    if (c?.owner) return { userId: c.owner, from: "case" };
  }
  if (doc.clientId) {
    const [cl] = await tx
      .select({ partner: clients.partnerUserId })
      .from(clients)
      .where(and(eq(clients.orgId, orgId), eq(clients.id, doc.clientId)))
      .limit(1);
    if (cl?.partner) return { userId: cl.partner, from: "client" };
  }
  if (doc.uploadedBy) return { userId: doc.uploadedBy, from: "uploader" };
  return { userId: null, from: null };
}

/** The `detail` fields that record an automatic owner. */
export function ownerDetail(o: DefaultOwner): Pick<DeadlineDetail, "ownerFrom" | "autoOwner"> {
  return o.userId && o.from ? { ownerFrom: o.from, autoOwner: o.userId } : {};
}

/**
 * A document joined a case: its deadlines that still have no owner, or are
 * held by the owner the app chose, go to the case owner (or the client's
 * partner when the case has none). Owners set by hand are kept.
 */
export async function reownForCase(
  tx: OrgTx,
  orgId: string,
  documentId: string,
  c: { id: string; clientId: string | null; ownerUserId: string | null },
): Promise<number> {
  const owner = await defaultOwner(tx, orgId, {
    caseId: c.id,
    clientId: c.clientId,
    uploadedBy: null,
  });
  if (!owner.userId) return 0;
  const rows = await tx
    .select({ d: deadlines })
    .from(deadlines)
    .innerJoin(
      findings,
      and(eq(findings.orgId, deadlines.orgId), eq(findings.id, deadlines.findingId)),
    )
    .where(and(eq(deadlines.orgId, orgId), eq(findings.documentId, documentId)));
  let moved = 0;
  for (const { d } of rows) {
    const detail = (d.detail ?? {}) as Partial<DeadlineDetail>;
    const automatic = d.ownerUserId === null || d.ownerUserId === detail.autoOwner;
    if (!automatic || d.ownerUserId === owner.userId) continue;
    await tx
      .update(deadlines)
      .set({ ownerUserId: owner.userId, detail: { ...detail, ...ownerDetail(owner) } })
      .where(and(eq(deadlines.orgId, orgId), eq(deadlines.id, d.id)));
    moved += 1;
  }
  return moved;
}
