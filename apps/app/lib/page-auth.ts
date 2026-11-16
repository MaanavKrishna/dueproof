/**
 * For server-rendered pages: `authorize()` and, when there is no session,
 * send the person to sign in; when they lack the permission, show Next's
 * not-found rather than leak that the record exists.
 */
import "server-only";
import { notFound, redirect } from "next/navigation";
import { type Action, type AuthContext, authorize } from "./authorize";
import { HttpError } from "./errors";

export async function authorizePage(action: Action, next: string): Promise<AuthContext> {
  try {
    return await authorize(action);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) {
      redirect(`/sign-in?next=${encodeURIComponent(next)}`);
    }
    if (e instanceof HttpError && e.status === 403) notFound();
    throw e;
  }
}
