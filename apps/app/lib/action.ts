/**
 * The result shape for server actions, and a runner that turns HttpErrors
 * (and invalid input or money inputs) into plain messages and anything else
 * into "Something went wrong" (only the error's name is logged: AGENTS rule 5).
 *
 *   return runAction("assignCase", async () => { const ctx = await authorize("case.assign"); … });
 *   return runAction(async () => …);   // unnamed
 */
import { MoneyInputError } from "@dueproof/core";
import { ZodError } from "zod";
import type { ActionResult } from "@/app/actions/upload";
import { HttpError } from "./errors";

export type { ActionResult };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>>;
export async function runAction<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>>;
export async function runAction<T>(
  nameOrFn: string | (() => Promise<T>),
  maybeFn?: () => Promise<T>,
): Promise<ActionResult<T>> {
  const name = typeof nameOrFn === "string" ? nameOrFn : "action";
  const fn = typeof nameOrFn === "string" ? maybeFn : nameOrFn;
  if (!fn) throw new TypeError("runAction needs a function");
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.code, message: e.message };
    if (e instanceof ZodError)
      return {
        ok: false,
        error: "bad_request",
        message: e.issues[0]?.message ?? "Some of the details aren't valid.",
      };
    if (e instanceof MoneyInputError) return { ok: false, error: "bad_request", message: e.message };
    console.error(`${name} failed`, e instanceof Error ? e.name : typeof e);
    return { ok: false, error: "internal", message: "Something went wrong." };
  }
}
