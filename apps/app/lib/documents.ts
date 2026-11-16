/** Read models for one document, org-scoped through withOrg. */
import "server-only";
import {
  and,
  asc,
  deadlines,
  documentEvents,
  documents,
  eq,
  evidence,
  findings,
  withOrg,
} from "@dueproof/db";
import type { AuthContext } from "./authorize";
import { notFound } from "./errors";

export async function getDocumentStatus(ctx: AuthContext, documentId: string) {
  const row = await withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const [doc] = await tx
      .select({ id: documents.id, status: documents.status, statusDetail: documents.statusDetail })
      .from(documents)
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, documentId)))
      .limit(1);
    return doc;
  });
  if (!row) throw notFound("That document");
  return row;
}

export async function getDocumentDetail(ctx: AuthContext, documentId: string) {
  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const [doc] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, documentId)))
      .limit(1);
    if (!doc) throw notFound("That document");
    const [found, proof, due, events] = await Promise.all([
      tx
        .select()
        .from(findings)
        .where(and(eq(findings.orgId, ctx.orgId), eq(findings.documentId, documentId)))
        .orderBy(asc(findings.ord)),
      tx
        .select()
        .from(evidence)
        .where(and(eq(evidence.orgId, ctx.orgId), eq(evidence.documentId, documentId))),
      tx
        .select()
        .from(deadlines)
        .innerJoin(findings, eq(findings.id, deadlines.findingId))
        .where(and(eq(deadlines.orgId, ctx.orgId), eq(findings.documentId, documentId)))
        .orderBy(asc(deadlines.dueOn)),
      tx
        .select()
        .from(documentEvents)
        .where(and(eq(documentEvents.orgId, ctx.orgId), eq(documentEvents.documentId, documentId)))
        .orderBy(asc(documentEvents.id)),
    ]);
    const { storageKey: _key, ...publicDoc } = doc;
    return {
      document: publicDoc,
      findings: found.map((f) => ({ ...f, evidence: proof.filter((e) => e.findingId === f.id) })),
      deadlines: due.map((d) => d.deadlines),
      events,
    };
  });
}
