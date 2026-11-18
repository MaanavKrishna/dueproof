/**
 * Setting a document aside as "Not a notice" (H2), and putting it back.
 *
 * Nothing is deleted. The document's role becomes "other" (the role for a
 * paper that is not a notice), its open findings and their deadlines are
 * dismissed, and the audit entry records exactly what changed, so "Put
 * back" (and the toast's Undo) reopens those and only those. Only a
 * document not yet filed in a case can be set aside: a filed one belongs to
 * its case.
 *
 * "Nothing is owed" is the answer to a document read to the end with
 * nothing found: it leaves the review queue (status "ready") and stays to
 * be filed or set aside. It too is audited and undoable.
 */
import "server-only";
import { Id } from "@dueproof/contracts";
import {
  and,
  audit,
  deadlines,
  desc,
  documents,
  eq,
  findingEdits,
  findings,
  inArray,
  type OrgTx,
  schema,
  withOrg,
} from "@dueproof/db";
import type { AuthContext } from "@/lib/authorize";
import { badRequest, notFound } from "@/lib/errors";
import { clientAllowed } from "@/lib/org";

const SET_ASIDE = "document.set_aside";
const PUT_BACK = "document.put_back";
const NOTHING_OWED = "document.nothing_owed";
const NOTHING_OWED_UNDONE = "document.nothing_owed_undone";

interface SetAsideDetail {
  previousRole: string;
  findingIds: string[];
  deadlineIds: string[];
}

export interface DocumentOutcome {
  documentId: string;
}

async function loadUnfiled(tx: OrgTx, ctx: AuthContext, documentId: string, allowFiled = false) {
  const [doc] = await tx
    .select({
      id: documents.id,
      clientId: documents.clientId,
      caseId: documents.caseId,
      role: documents.role,
      status: documents.status,
    })
    .from(documents)
    .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, documentId)))
    .limit(1);
  if (!doc || !clientAllowed(ctx, doc.clientId)) throw notFound("That document");
  if (doc.caseId && !allowFiled)
    throw badRequest("It's filed in a case, so it stays with the case.");
  return doc;
}

/** "Not a notice": hide the document from the Inbox and stop its deadlines counting. */
export async function setAside(ctx: AuthContext, rawId: string): Promise<DocumentOutcome> {
  const documentId = Id.parse(rawId);
  return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    const doc = await loadUnfiled(tx, ctx, documentId);
    if (doc.role === "other") return { documentId };
    const open = await tx
      .select({ id: findings.id })
      .from(findings)
      .where(
        and(
          eq(findings.orgId, ctx.orgId),
          eq(findings.documentId, documentId),
          eq(findings.status, "open"),
        ),
      );
    const findingIds = open.map((f) => f.id);
    let deadlineIds: string[] = [];
    if (findingIds.length) {
      await tx
        .update(findings)
        .set({ status: "dismissed" })
        .where(and(eq(findings.orgId, ctx.orgId), inArray(findings.id, findingIds)));
      await tx.insert(findingEdits).values(
        findingIds.map((findingId) => ({
          orgId: ctx.orgId,
          findingId,
          actorUserId: ctx.userId,
          field: "status",
          before: "open" as unknown as object,
          after: "dismissed" as unknown as object,
          note: "Not a notice",
        })),
      );
      const dropped = await tx
        .update(deadlines)
        .set({ status: "dismissed" })
        .where(
          and(
            eq(deadlines.orgId, ctx.orgId),
            inArray(deadlines.findingId, findingIds),
            eq(deadlines.status, "open"),
          ),
        )
        .returning({ id: deadlines.id });
      deadlineIds = dropped.map((d) => d.id);
    }
    await tx
      .update(documents)
      .set({ role: "other" })
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, documentId)));
    const detail: SetAsideDetail = { previousRole: doc.role, findingIds, deadlineIds };
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: SET_ASIDE,
      targetType: "document",
      targetId: documentId,
      requestId: ctx.requestId,
      detail: { ...detail },
    });
    return { documentId };
  });
}

/** Undo "Not a notice": the document, its findings and its deadlines come back as they were. */
export async function putBack(ctx: AuthContext, rawId: string): Promise<DocumentOutcome> {
  const documentId = Id.parse(rawId);
  return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    const doc = await loadUnfiled(tx, ctx, documentId);
    if (doc.role !== "other") return { documentId };
    const [last] = await tx
      .select({ detail: schema.audit.detail })
      .from(schema.audit)
      .where(
        and(
          eq(schema.audit.orgId, ctx.orgId),
          eq(schema.audit.targetType, "document"),
          eq(schema.audit.targetId, documentId),
          eq(schema.audit.action, SET_ASIDE),
        ),
      )
      .orderBy(desc(schema.audit.id))
      .limit(1);
    const d = (last?.detail ?? null) as Partial<SetAsideDetail> | null;
    const findingIds = d?.findingIds ?? [];
    const deadlineIds = d?.deadlineIds ?? [];
    if (findingIds.length) {
      const back = await tx
        .update(findings)
        .set({ status: "open" })
        .where(
          and(
            eq(findings.orgId, ctx.orgId),
            eq(findings.documentId, documentId),
            inArray(findings.id, findingIds),
            eq(findings.status, "dismissed"),
          ),
        )
        .returning({ id: findings.id });
      if (back.length)
        await tx.insert(findingEdits).values(
          back.map((f) => ({
            orgId: ctx.orgId,
            findingId: f.id,
            actorUserId: ctx.userId,
            field: "status",
            before: "dismissed" as unknown as object,
            after: "open" as unknown as object,
            note: "Put back",
          })),
        );
    }
    if (deadlineIds.length && findingIds.length)
      await tx
        .update(deadlines)
        .set({ status: "open" })
        .where(
          and(
            eq(deadlines.orgId, ctx.orgId),
            inArray(deadlines.id, deadlineIds),
            inArray(deadlines.findingId, findingIds),
            eq(deadlines.status, "dismissed"),
          ),
        );
    const role = (d?.previousRole ?? "notice") as typeof doc.role;
    await tx
      .update(documents)
      .set({ role: role === "other" ? "notice" : role })
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, documentId)));
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: PUT_BACK,
      targetType: "document",
      targetId: documentId,
      requestId: ctx.requestId,
    });
    return { documentId };
  });
}

/** A document with nothing found, and a person agrees nothing is owed: it leaves review. */
export async function markNothingOwed(
  ctx: AuthContext,
  rawId: string,
  undo = false,
): Promise<DocumentOutcome> {
  const documentId = Id.parse(rawId);
  return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    const doc = await loadUnfiled(tx, ctx, documentId, true);
    const from = undo ? "ready" : "needs_review";
    if (doc.status !== from) return { documentId };
    await tx
      .update(documents)
      .set({ status: undo ? "needs_review" : "ready" })
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, documentId)));
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: undo ? NOTHING_OWED_UNDONE : NOTHING_OWED,
      targetType: "document",
      targetId: documentId,
      requestId: ctx.requestId,
    });
    return { documentId };
  });
}
