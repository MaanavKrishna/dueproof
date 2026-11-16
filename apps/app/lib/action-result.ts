/**
 * Server actions return a result instead of throwing, so the UI can show
 * the message. Messages come from HttpError (safe to show); anything else
 * becomes "Something went wrong." and only the error's name is logged.
 */
import { HttpError } from "./errors";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; message: string };

export async function runAction<T>(label: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.code, message: e.message };
    // Next.js redirects and notFound() are thrown; let them through.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(`${label} failed`, e instanceof Error ? e.name : typeof e);
    return { ok: false, error: "internal", message: "Something went wrong." };
  }
}
