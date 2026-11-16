"use server";
/**
 * Server actions for Settings → System: check the audit trail's hash chain
 * and page through it. Needs `audit.view` (owners and admins).
 */
import { type ActionResult, runAction } from "@/lib/action-result";
import { authorize } from "@/lib/authorize";
import { badRequest } from "@/lib/errors";
import { type AuditRow, listAudit, verifyAudit } from "@/lib/system";

export async function verifyAuditChain(): Promise<
  ActionResult<{ ok: boolean; count: number; brokenAt?: number; checkedAt: string }>
> {
  return runAction("audit verify", async () => {
    const r = await verifyAudit(await authorize("audit.view"));
    return { ...r, checkedAt: new Date().toISOString() };
  });
}

export async function loadAuditPage(page: number): Promise<ActionResult<AuditRow[]>> {
  return runAction("audit page", async () => {
    if (!Number.isInteger(page) || page < 0 || page > 10_000) throw badRequest("Bad page.");
    return listAudit(await authorize("audit.view"), page);
  });
}
