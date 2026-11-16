/**
 * Server components start here, as actions start with authorize(): signed
 * out → the sign-in page; refused → a named "you don't have access" state
 * (01 §4 "When things go wrong"), rendered by the page.
 */
import "server-only";
import { listOrgMembers } from "@dueproof/auth";
import { redirect } from "next/navigation";
import { type Action, type AuthContext, authorize, type Resource } from "./authorize";
import { HttpError } from "./errors";
import { getContainer } from "./server/container";

export type Gate =
  | { ok: true; ctx: AuthContext }
  | { ok: false; status: 403; message: string; admins: string[] };

export const SIGN_IN_PATH = "/sign-in";

export async function gatePage(action: Action, resource?: Resource, next = "/"): Promise<Gate> {
  try {
    return { ok: true, ctx: await authorize(action, resource ? { resource } : {}) };
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) {
      redirect(`${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`);
    }
    if (e instanceof HttpError && e.status === 403) {
      return { ok: false, status: 403, message: e.message, admins: await adminsForSession() };
    }
    throw e;
  }
}

/** The organisation's owners and admins, by name, for the refusal page. */
async function adminsForSession(): Promise<string[]> {
  try {
    const ctx = await authorize("case.view").catch(() => null);
    if (!ctx) return [];
    const { database } = await getContainer();
    return (await listOrgMembers(database, ctx.orgId))
      .filter((m) => m.role === "owner" || m.role === "admin")
      .map((m) => m.name);
  } catch {
    return [];
  }
}
