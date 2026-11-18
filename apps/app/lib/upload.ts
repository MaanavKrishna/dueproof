/**
 * Upload flow (03 §6): init → signed PUT straight to storage → complete.
 *
 * - init: validates name, size and claimed type; dedupes by (org, sha256);
 *   creates the document as `received`; returns a ≤ 5-minute signed PUT.
 *   A file that was quarantined or failed can be sent again: the same row
 *   goes back to `received` instead of being called a duplicate. Two inits
 *   of one file at once get the same document, never a conflict error.
 * - The received date is the person's: the upload UI shows it (today by
 *   default) and sends it. Without one, the upload day stands in and the
 *   document is marked `receivedOnAssumed`, so every deadline that counts
 *   from it is flagged "received date assumed: confirm" (lib/received-date.ts).
 * - complete: reads the object back, checks size, sha256 and magic bytes;
 *   a mismatch quarantines the document and deletes the object. Otherwise
 *   the document is `stored` and processDocument starts. The move out of
 *   `received` is a conditional update, so two completes at once start one
 *   pipeline run.
 *
 * Both take an AuthContext from authorize(); callers never pass an org id.
 */
import "server-only";
import { createHash } from "node:crypto";
import { DocumentRole, Id, IsoDate } from "@dueproof/contracts";
import { isValidIsoDate } from "@dueproof/core";
import { and, audit, documents, eq, orgSettings, uuidv7, withOrg } from "@dueproof/db";
import { orgKey, type SignedUrl } from "@dueproof/storage";
import { z } from "zod";
import type { AuthContext } from "./authorize";
import { badRequest, HttpError, notFound } from "./errors";
import { isAllowedMime, sniffMime } from "./mime";
import { announce, claimStatus, todayIn, writeStatus } from "./pipeline/status";

export const InitUploadInput = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine(
      (s) => ![...s].some((ch) => ch.charCodeAt(0) < 32 || ch === "/" || ch === "\\"),
      "file name has characters we can't store",
    ),
  size: z.number().int().positive(),
  mime: z.string().max(100),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 must be 64 lowercase hex characters"),
  /** The day the document reached the firm. Left out, the upload day is assumed and flagged. */
  receivedOn: IsoDate.optional(),
  role: DocumentRole.default("notice"),
  caseId: Id.optional(),
  clientId: Id.optional(),
});
export type InitUploadInput = z.input<typeof InitUploadInput>;

export type InitUploadResult =
  | { status: "duplicate"; documentId: string }
  | { status: "upload"; documentId: string; upload: SignedUrl };

/** A document in one of these states can be uploaded again (a retry). */
const REPLACEABLE: ReadonlySet<string> = new Set(["quarantined", "failed"]);

export async function initUpload(
  ctx: AuthContext,
  raw: InitUploadInput,
): Promise<InitUploadResult> {
  const parsed = InitUploadInput.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "invalid upload");
  const input = parsed.data;
  const { env, database, storage } = ctx.container;

  if (input.size > env.UPLOAD_MAX_BYTES) {
    throw new HttpError(
      413,
      `Files can be up to ${Math.floor(env.UPLOAD_MAX_BYTES / 1_048_576)} MB.`,
      "too_large",
    );
  }
  if (!isAllowedMime(input.mime)) {
    throw new HttpError(415, "Upload a PDF, JPEG, PNG or TIFF file.", "unsupported_type");
  }

  const storageKey = orgKey(ctx.orgId, "originals", input.sha256);
  const outcome = await withOrg(database, ctx.orgId, async (tx, scope) => {
    const [settings] = await tx.select({ tz: orgSettings.timezone }).from(orgSettings).limit(1);
    const today = todayIn(settings?.tz ?? "Asia/Kolkata");
    if (input.receivedOn && (!isValidIsoDate(input.receivedOn) || input.receivedOn > today))
      throw badRequest("The received date must be a real date, today or earlier.");
    const dates = {
      receivedOn: input.receivedOn ?? today,
      receivedOnAssumed: input.receivedOn === undefined,
    };
    const find = async () => {
      const [row] = await tx
        .select({ id: documents.id, status: documents.status })
        .from(documents)
        .where(and(eq(documents.orgId, ctx.orgId), eq(documents.sha256, input.sha256)))
        .limit(1);
      return row;
    };
    /** The same file again: resume an unfinished upload, or send a dead one again. */
    const reuse = async (row: { id: string; status: string }) => {
      const where = and(eq(documents.orgId, ctx.orgId), eq(documents.id, row.id));
      if (row.status === "received") {
        if (input.receivedOn) await tx.update(documents).set(dates).where(where);
        return { kind: "resume" as const, id: row.id };
      }
      if (!REPLACEABLE.has(row.status)) return { kind: "duplicate" as const, id: row.id };
      await tx
        .update(documents)
        .set({
          filename: input.filename,
          mime: input.mime,
          sizeBytes: input.size,
          role: input.role,
          ...(input.caseId ? { caseId: input.caseId } : {}),
          ...(input.clientId ? { clientId: input.clientId } : {}),
          ...dates,
          uploadedBy: ctx.userId,
        })
        .where(where);
      // Of two retries at once one moves it back; the other resumes the same row.
      await claimStatus(
        tx,
        ctx.orgId,
        row.id,
        row.status as "quarantined" | "failed",
        "received",
        "sent_again",
      );
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "document.upload.retry",
        targetType: "document",
        targetId: row.id,
        requestId: ctx.requestId,
        detail: { size: input.size, mime: input.mime, was: row.status },
      });
      return { kind: "resume" as const, id: row.id };
    };

    const existing = await find();
    if (existing) return reuse(existing);

    const id = uuidv7();
    // A second init of the same file at once inserts nothing and takes the first one's row.
    const inserted = await tx
      .insert(documents)
      .values({
        id,
        orgId: ctx.orgId,
        filename: input.filename,
        mime: input.mime,
        sizeBytes: input.size,
        sha256: input.sha256,
        storageKey,
        role: input.role,
        caseId: input.caseId ?? null,
        clientId: input.clientId ?? null,
        ...dates,
        channel: "upload",
        status: "received",
        uploadedBy: ctx.userId,
      })
      .onConflictDoNothing({ target: [documents.orgId, documents.sha256] })
      .returning({ id: documents.id });
    if (!inserted.length) {
      const winner = await find();
      if (!winner) throw new HttpError(409, "Try the upload again.", "conflict");
      return reuse(winner);
    }
    await writeStatus(tx, ctx.orgId, id, "received", null);
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "document.upload.init",
      targetType: "document",
      targetId: id,
      requestId: ctx.requestId,
      detail: {
        size: input.size,
        mime: input.mime,
        ...(dates.receivedOnAssumed ? { receivedOnAssumed: true } : {}),
      },
    });
    return { kind: "new" as const, id };
  });

  if (outcome.kind === "duplicate") return { status: "duplicate", documentId: outcome.id };
  const upload = await storage.putSignedUrl(storageKey, {
    contentType: input.mime,
    maxBytes: input.size,
  });
  return { status: "upload", documentId: outcome.id, upload };
}

export interface CompleteUploadResult {
  documentId: string;
  status: "stored" | "quarantined" | "duplicate";
  runId?: string;
  reason?: string;
}

export async function completeUpload(
  ctx: AuthContext,
  documentId: string,
): Promise<CompleteUploadResult> {
  if (!Id.safeParse(documentId).success) throw badRequest("invalid document id");
  const { database, storage } = ctx.container;

  const doc = await withOrg(database, ctx.orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, documentId)))
      .limit(1);
    return row;
  });
  if (!doc) throw notFound("That document");
  if (doc.status !== "received") return { documentId, status: "duplicate" };

  const body = await storage.get(doc.storageKey);
  if (!body)
    throw new HttpError(409, "The file hasn't arrived yet. Try the upload again.", "not_uploaded");

  const sha = createHash("sha256").update(body).digest("hex");
  const sniffed = sniffMime(body);
  let problem: string | null = null;
  if (body.byteLength !== doc.sizeBytes) problem = "size_mismatch";
  else if (sha !== doc.sha256) problem = "hash_mismatch";
  else if (!sniffed) problem = "unsupported_type";
  else if (sniffed !== doc.mime) problem = "type_mismatch";

  if (problem) {
    await storage.delete(doc.storageKey);
    const claimed = await withOrg(database, ctx.orgId, async (tx, scope) => {
      if (!(await claimStatus(tx, ctx.orgId, documentId, "received", "quarantined", problem)))
        return false;
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "document.quarantine",
        targetType: "document",
        targetId: documentId,
        requestId: ctx.requestId,
        detail: { reason: problem },
      });
      return true;
    });
    if (!claimed) return { documentId, status: "duplicate" };
    announce(ctx.orgId, documentId, "quarantined", problem);
    return { documentId, status: "quarantined", reason: problem };
  }

  // Of two completes at once, only the one that moves the row out of `received` starts a run.
  const claimed = await withOrg(database, ctx.orgId, async (tx, scope) => {
    if (!(await claimStatus(tx, ctx.orgId, documentId, "received", "stored", null))) return false;
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "document.upload.complete",
      targetType: "document",
      targetId: documentId,
      requestId: ctx.requestId,
    });
    return true;
  });
  if (!claimed) return { documentId, status: "duplicate" };
  announce(ctx.orgId, documentId, "stored");

  const runId = await ctx.container.startPipeline({ orgId: ctx.orgId, documentId });
  return { documentId, status: "stored", runId };
}
