"use server";
/**
 * Recovery actions for a document that stopped (01 §4 "When things go
 * wrong"): enter the password of a protected PDF, or retry a failed read.
 * Both start processDocument again; the original file is always kept.
 */
import { Id } from "@dueproof/contracts";
import { and, audit, documents, eq, type OrgTx, withOrg } from "@dueproof/db";
import { z } from "zod";
import { type ActionResult, runAction } from "@/lib/action";
import { authorize } from "@/lib/authorize";
import { requireClient } from "@/lib/client-access";
import { storeDocumentPassword } from "@/lib/document-passwords";
import { HttpError, notFound } from "@/lib/errors";
import { announce, writeStatus } from "@/lib/pipeline/status";

const PasswordInput = z.object({
  documentId: Id,
  password: z.string().min(1, "Enter the password.").max(512),
});

async function restart(
  documentId: string,
  allowed: readonly string[],
  action: string,
  /** Runs inside the status change's transaction, before the pipeline starts. */
  before?: (tx: OrgTx, orgId: string, secret: string) => Promise<void>,
): Promise<{ documentId: string; runId: string }> {
  const ctx = await authorize("document.upload");
  const ok = await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
    const [doc] = await tx
      .select({ status: documents.status, clientId: documents.clientId })
      .from(documents)
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, documentId)))
      .limit(1);
    if (!doc) throw notFound("That document");
    requireClient(ctx, "document.upload", doc.clientId, "That document");
    if (!allowed.includes(doc.status))
      throw new HttpError(409, "This document isn't waiting for that.", "wrong_state");
    await writeStatus(tx, ctx.orgId, documentId, "stored", action);
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action,
      targetType: "document",
      targetId: documentId,
      requestId: ctx.requestId,
    });
    await before?.(tx, ctx.orgId, ctx.container.env.AUTH_SECRET);
    return true;
  });
  if (!ok) throw notFound("That document");
  announce(ctx.orgId, documentId, "stored", action);
  const runId = await ctx.container.startPipeline({ orgId: ctx.orgId, documentId });
  return { documentId, runId };
}

/** The password is kept encrypted for this run only (15 minutes at most), never logged. */
export async function unlockDocument(
  input: z.input<typeof PasswordInput>,
): Promise<ActionResult<{ documentId: string; runId: string }>> {
  return runAction(async () => {
    const { documentId, password } = PasswordInput.parse(input);
    return restart(
      documentId,
      ["needs_password"],
      "document.password_entered",
      (tx, orgId, secret) => storeDocumentPassword(tx, secret, { orgId, documentId }, password),
    );
  });
}

export async function retryDocument(
  documentId: string,
): Promise<ActionResult<{ documentId: string; runId: string }>> {
  return runAction(async () => restart(Id.parse(documentId), ["failed"], "document.retry"));
}
