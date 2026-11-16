/**
 * Upload flow (03 §6): init → signed PUT straight to storage → complete.
 *
 * - init: validates name, size and claimed type; dedupes by (org, sha256);
 *   creates the document as `received`; returns a ≤ 5-minute signed PUT.
 * - complete: reads the object back, checks size, sha256 and magic bytes;
 *   a mismatch quarantines the document and deletes the object. Otherwise
 *   the document is `stored` and processDocument starts.
 *
 * Both take an AuthContext from authorize(); callers never pass an org id.
 */
import "server-only";
import { createHash } from "node:crypto";
import { DocumentRole, Id, IsoDate } from "@dueproof/contracts";
import { and, audit, documents, eq, orgSettings, uuidv7, withOrg } from "@dueproof/db";
import { orgKey, type SignedUrl } from "@dueproof/storage";
import { z } from "zod";
import type { AuthContext } from "./authorize";
import { badRequest, HttpError, notFound } from "./errors";
import { isAllowedMime, sniffMime } from "./mime";
import { announce, todayIn, writeStatus } from "./pipeline/status";

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
  receivedOn: IsoDate.optional(),
  role: DocumentRole.default("notice"),
  caseId: Id.optional(),
  clientId: Id.optional(),
});
export type InitUploadInput = z.input<typeof InitUploadInput>;

export type InitUploadResult =
  | { status: "duplicate"; documentId: string }
  | { status: "upload"; documentId: string; upload: SignedUrl };

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
    const [existing] = await tx
      .select({ id: documents.id, status: documents.status })
      .from(documents)
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.sha256, input.sha256)))
      .limit(1);
    if (existing && existing.status !== "received")
      return { kind: "duplicate" as const, id: existing.id };
    if (existing) return { kind: "resume" as const, id: existing.id };

    const [settings] = await tx.select({ tz: orgSettings.timezone }).from(orgSettings).limit(1);
    const id = uuidv7();
    await tx.insert(documents).values({
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
      receivedOn: input.receivedOn ?? todayIn(settings?.tz ?? "Asia/Kolkata"),
      channel: "upload",
      status: "received",
      uploadedBy: ctx.userId,
    });
    await writeStatus(tx, ctx.orgId, id, "received", null);
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "document.upload.init",
      targetType: "document",
      targetId: id,
      requestId: ctx.requestId,
      detail: { size: input.size, mime: input.mime },
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
    await withOrg(database, ctx.orgId, async (tx, scope) => {
      await writeStatus(tx, ctx.orgId, documentId, "quarantined", problem);
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "document.quarantine",
        targetType: "document",
        targetId: documentId,
        requestId: ctx.requestId,
        detail: { reason: problem },
      });
    });
    announce(ctx.orgId, documentId, "quarantined", problem);
    return { documentId, status: "quarantined", reason: problem };
  }

  await withOrg(database, ctx.orgId, async (tx, scope) => {
    await writeStatus(tx, ctx.orgId, documentId, "stored", null);
    await audit.write(tx, scope, {
      actor: ctx.userId,
      action: "document.upload.complete",
      targetType: "document",
      targetId: documentId,
      requestId: ctx.requestId,
    });
  });
  announce(ctx.orgId, documentId, "stored");

  const runId = await ctx.container.startPipeline({ orgId: ctx.orgId, documentId });
  return { documentId, status: "stored", runId };
}
