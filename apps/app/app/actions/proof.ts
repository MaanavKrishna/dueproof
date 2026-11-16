"use server";
/**
 * The page behind a finding, for the proof sheet (Today, Inbox) and the case
 * page's inspector. Page images come back as ≤ 5-minute signed URLs.
 */
import { Id } from "@dueproof/contracts";
import { and, documents, eq, withOrg } from "@dueproof/db";
import { type ActionResult, runAction } from "@/lib/action";
import { authorize } from "@/lib/authorize";
import { notFound } from "@/lib/errors";
import { clientAllowed } from "@/lib/org";
import { type ProofData, readProof } from "@/lib/proof";

export async function getProof(documentId: string): Promise<ActionResult<ProofData>> {
  return runAction(async () => {
    const ctx = await authorize("case.view");
    const id = Id.parse(documentId);
    const { storage } = ctx.container;
    const proof = await withOrg(ctx.container.database, ctx.orgId, async (tx) => {
      const [doc] = await tx
        .select({ clientId: documents.clientId })
        .from(documents)
        .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, id)))
        .limit(1);
      if (!doc || !clientAllowed(ctx, doc.clientId)) return null;
      return readProof(tx, ctx.orgId, id, async (key) => (await storage.getSignedUrl(key)).url);
    });
    if (!proof) throw notFound("That document");
    return proof;
  });
}
