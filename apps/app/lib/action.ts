/**
 * The result shape for server actions, and a runner that turns HttpErrors
 * into plain messages and anything else into "Something went wrong" (only
 * the error's name is logged: AGENTS rule 5).
 */
import type { ActionResult } from "@/app/actions/upload";
import { HttpError } from "./errors";

export type { ActionResult };

export async function runAction<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.code, message: e.message };
    console.error(`${name} failed`, e instanceof Error ? e.name : typeof e);
    return { ok: false, error: "internal", message: "Something went wrong." };
  }
}
