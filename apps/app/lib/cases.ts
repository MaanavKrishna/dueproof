/**
 * Filing documents into case threads (01 §4 "Thread"). A person confirms
 * the link; the document's findings and deadlines follow it into the case,
 * and an order adds its appeal window.
 */
import "server-only";
import { DocumentRole, Id } from "@dueproof/contracts";
import {
  and,
  audit,
  cases,
  clients,
  deadlines,
  documents,
  eq,
  findings,
  type OrgTx,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { z } from "zod";
import type { AuthContext } from "./authorize";
import { loadOrgCalendar, type OrgCalendar } from "./calendar";
import { notFound } from "./errors";
import { addOrderWindow, type OrderWindowOutcome } from "./orders";

type CaseRow = typeof cases.$inferSelect;

async function fileInto(
  tx: OrgTx,
  ctx: AuthContext,
  documentId: string,
  c: CaseRow,
  cal: OrgCalendar,
  role?: z.infer<typeof DocumentRole>,
): Promise<OrderWindowOutcome | null> {
  await tx
    .update(documents)
    .set({ caseId: c.id, clientId: c.clientId, ...(role ? { role } : {}) })
    .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, documentId)));
  const own = await tx
    .select({ id: findings.id })
    .from(findings)
    .where(and(eq(findings.orgId, ctx.orgId), eq(findings.documentId, documentId)));
  await tx
    .update(findings)
    .set({ caseId: c.id })
    .where(and(eq(findings.orgId, ctx.orgId), eq(findings.documentId, documentId)));
  for (const f of own) {
    await tx
      .update(deadlines)
      .set({ caseId: c.id, clientId: c.clientId })
      .where(and(eq(deadlines.orgId, ctx.orgId), eq(deadlines.findingId, f.id)));
  }
  const [doc] = await tx
    .select({ role: documents.role })
    .from(documents)
    .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, documentId)));
  return doc?.role === "order" ? addOrderWindow(tx, ctx, documentId, c, cal) : null;
}

export const LinkInput = z.object({
  documentId: Id,
  caseId: Id,
  role: DocumentRole.optional(),
});

export async function linkDocument(ctx: AuthContext, input: z.input<typeof LinkInput>) {
  const { documentId, caseId, role } = LinkInput.parse(input);
  const cal = await loadOrgCalendar(ctx.container, ctx.orgId);
  return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    const [c] = await tx
      .select()
      .from(cases)
      .where(and(eq(cases.orgId, ctx.orgId), eq(cases.id, caseId)))
      .limit(1);
    if (!c) throw notFound("That case");
    const [doc] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, documentId)))
      .limit(1);
    if (!doc) throw notFound("That document");
    const window = await fileInto(tx, ctx, documentId, c, cal, role);
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "case.document.link",
      targetType: "case",
      targetId: c.id,
      requestId: ctx.requestId,
      detail: { documentId, role: role ?? null, appealWindow: window?.added ?? false },
    });
    return { caseId: c.id, appealWindow: window };
  });
}

export const CreateCaseInput = z
  .object({
    documentId: Id,
    clientId: Id.optional(),
    newClientName: z.string().trim().min(1).max(200).optional(),
    newClientGstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[0-9]{2}[A-Z0-9]{13}$/, "A GSTIN has 15 characters.")
      .optional(),
    title: z.string().trim().min(1).max(300).optional(),
  })
  .refine((v) => !(v.clientId && v.newClientName), "Choose a client or name a new one, not both.");

/** Open a new case from a document in the Inbox. Creating a client needs client.edit, checked by the caller. */
export async function createCaseFromDocument(
  ctx: AuthContext,
  input: z.input<typeof CreateCaseInput>,
) {
  const v = CreateCaseInput.parse(input);
  const cal = await loadOrgCalendar(ctx.container, ctx.orgId);
  return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    const [doc] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, v.documentId)))
      .limit(1);
    if (!doc) throw notFound("That document");
    let clientId = v.clientId ?? doc.clientId ?? null;
    if (v.clientId) {
      const [cl] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.orgId, ctx.orgId), eq(clients.id, v.clientId)))
        .limit(1);
      if (!cl) throw notFound("That client");
    }
    if (v.newClientName) {
      clientId = uuidv7();
      await tx.insert(clients).values({
        id: clientId,
        orgId: ctx.orgId,
        name: v.newClientName,
        gstins: v.newClientGstin ? [v.newClientGstin] : [],
        ...(v.newClientGstin ? { pan: v.newClientGstin.slice(2, 12) } : {}),
      });
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "client.create",
        targetType: "client",
        targetId: clientId,
        requestId: ctx.requestId,
      });
    }
    const id = uuidv7();
    const [c] = await tx
      .insert(cases)
      .values({
        id,
        orgId: ctx.orgId,
        clientId,
        title: v.title ?? doc.title ?? doc.filename,
        noticeType: doc.docType,
        authority: doc.issuingOffice,
        reference: doc.reference,
        ownerUserId: ctx.userId,
      })
      .returning();
    if (!c) throw new Error("case insert returned no row");
    const window = await fileInto(tx, ctx, doc.id, c, cal);
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "case.create",
      targetType: "case",
      targetId: id,
      requestId: ctx.requestId,
      detail: { documentId: doc.id, clientId },
    });
    return { caseId: id, appealWindow: window };
  });
}
