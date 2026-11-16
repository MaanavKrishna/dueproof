"use server";
/**
 * Server actions for the upload flow, for the app's own UI. Next.js checks
 * the request origin for server actions; authorize() checks the session,
 * organisation and role.
 *
 *   const init = await startUpload({ filename, size, mime, sha256 });
 *   if (init.status === "upload") await fetch(init.upload.url, { method: "PUT", headers: init.upload.headers, body: file });
 *   const done = await finishUpload(init.documentId);
 */
import { authorize } from "@/lib/authorize";
import { HttpError } from "@/lib/errors";
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
  return run(async () => initUpload(await authorize("document.upload"), input));
}

export async function finishUpload(
  documentId: string,
): Promise<ActionResult<CompleteUploadResult>> {
  return run(async () => completeUpload(await authorize("document.upload"), documentId));
}
