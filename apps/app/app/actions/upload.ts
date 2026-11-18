"use server";
/**
 * Server actions for the upload flow, for the app's own UI. Next.js checks
 * the request origin for server actions; authorize() checks the session,
 * organisation and role.
 *
 *   const init = await startUpload({ filename, size, mime, sha256, receivedOn });
 *   if (init.status === "upload") await fetch(init.upload.url, { method: "PUT", headers: init.upload.headers, body: file });
 *   const done = await finishUpload(init.documentId);
 *
 * `receivedOn` is the day the document arrived; the upload UI shows it
 * (today by default). `setReceivedDate` changes or confirms it afterwards.
 */
import { Id, IsoDate } from "@dueproof/contracts";
import { isValidIsoDate } from "@dueproof/core";
import { and, documents, eq, type OrgTx, withOrg } from "@dueproof/db";
import { headers } from "next/headers";
import { z } from "zod";
import { authorize } from "@/lib/authorize";
import { loadOrgCalendar } from "@/lib/calendar";
import { badRequest, HttpError, notFound } from "@/lib/errors";
import { todayIn } from "@/lib/pipeline/status";
import { limitRequest } from "@/lib/rate-limit";
import { applyReceivedDate } from "@/lib/received-date";
import {
  type CompleteUploadResult,
  completeUpload,
  type InitUploadInput,
  type InitUploadResult,
  initUpload,
} from "@/lib/upload";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.code, message: e.message };
    console.error("upload action failed", e instanceof Error ? e.name : typeof e);
    return { ok: false, error: "internal", message: "Something went wrong." };
  }
}

export async function startUpload(input: InitUploadInput): Promise<ActionResult<InitUploadResult>> {
  return run(async () => {
    const ctx = await authorize("document.upload");
    await limitRequest(await headers(), "upload", ctx);
    return initUpload(ctx, input);
  });
}

export async function finishUpload(
  documentId: string,
): Promise<ActionResult<CompleteUploadResult>> {
  return run(async () => completeUpload(await authorize("document.upload"), documentId));
}

const ReceivedInput = z.object({
  documentId: Id,
  receivedOn: IsoDate,
  reason: z.string().trim().max(500).optional(),
});

/**
 * Set a document's received date after upload, or confirm the assumed one
 * (the upload tray and the Inbox). Deadlines that count from it are
 * recomputed and the change is audited (lib/received-date.ts).
 */
export async function setReceivedDate(
  input: z.input<typeof ReceivedInput>,
): Promise<ActionResult<{ documentId: string; receivedOn: string; recomputed: number }>> {
  return run(async () => {
    const parsed = ReceivedInput.safeParse(input);
    if (!parsed.success || !isValidIsoDate(parsed.data.receivedOn))
      throw badRequest("Choose the date the document arrived.");
    const v = parsed.data;
    const pre = await authorize("deadline.edit");
    const load = async (tx: OrgTx) => {
      const [row] = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.orgId, pre.orgId), eq(documents.id, v.documentId)))
        .limit(1);
      return row;
    };
    const doc = await withOrg(pre.container.database, pre.orgId, load);
    if (!doc) throw notFound("That document");
    const ctx = doc.clientId
      ? await authorize("deadline.edit", { resource: { clientId: doc.clientId } })
      : pre;
    const cal = await loadOrgCalendar(ctx.container, ctx.orgId);
    if (v.receivedOn > todayIn(cal.timezone))
      throw badRequest("The received date can't be in the future.");
    const r = await withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      const fresh = await load(tx);
      if (!fresh) throw notFound("That document");
      const reason =
        v.reason ||
        (fresh.receivedOn === v.receivedOn ? "Received date confirmed" : "Received date set");
      return applyReceivedDate(tx, scope, ctx, fresh, v.receivedOn, reason, cal);
    });
    return { documentId: doc.id, receivedOn: v.receivedOn, recomputed: r.recomputed };
  });
}
