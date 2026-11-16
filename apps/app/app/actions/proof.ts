"use server";
/**
 * The page behind a finding, for the proof sheet (Today, Inbox) and the case
 * page's inspector. Page images come back as ≤ 5-minute signed URLs.
 */
import { Id } from "@dueproof/contracts";
import { withOrg } from "@dueproof/db";
import { type ActionResult, runAction } from "@/lib/action";
import { authorize } from "@/lib/authorize";
import { notFound } from "@/lib/errors";
import { type ProofData, readProof } from "@/lib/proof";

export async function getProof(documentId: string): Promise<ActionResult<ProofData>> {
  return runAction(async () => {
    const ctx = await authorize("case.view");
    const id = Id.parse(documentId);
    const { storage } = ctx.container;
    const proof = await withOrg(ctx.container.database, ctx.orgId, (tx) =>
      readProof(tx, ctx.orgId, id, async (key) => (await storage.getSignedUrl(key)).url),
    );
    if (!proof) throw notFound("That document");
    return proof;
  });
}
