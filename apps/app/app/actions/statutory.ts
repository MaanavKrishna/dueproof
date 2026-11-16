"use server";
/**
 * Server action: rebuild a client's statutory calendar after its
 * registrations change. Needs `client.edit` on that client.
 *
 *   const res = await regenerateStatutory(clientId);
 */
import { authorize } from "@/lib/authorize";
import { badRequest, HttpError } from "@/lib/errors";
import { type RegenerateResult, regenerateStatutoryDeadlines } from "@/lib/statutory";
import type { ActionResult } from "./upload";

export async function regenerateStatutory(
  clientId: string,
): Promise<ActionResult<RegenerateResult>> {
  try {
    if (typeof clientId !== "string" || !clientId) throw badRequest("Choose a client.");
    const ctx = await authorize("client.edit", { resource: { clientId } });
    const data = await regenerateStatutoryDeadlines(ctx.container.database, ctx.orgId, clientId, {
      actor: ctx.userId,
      requestId: ctx.requestId,
    });
    return { ok: true, data };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.code, message: e.message };
    console.error("statutory action failed", e instanceof Error ? e.name : typeof e);
    return { ok: false, error: "internal", message: "Something went wrong." };
  }
}
