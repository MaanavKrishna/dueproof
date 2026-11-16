/**
 * `authorize()` opens every server action and route handler (AGENTS rule 4).
 * It resolves the session, the active organisation and the member's role,
 * asks the policy (`can`) and returns the context every query needs. Data is
 * then read with `withOrg(database, ctx.orgId, …)`.
 *
 *   const ctx = await authorize("document.upload");                 // server action
 *   const ctx = await authorizeRequest(request, "document.read");   // route handler
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { firstMembershipOrg, getMembership } from "@dueproof/auth";
import type { Role } from "@dueproof/contracts";
import { type Action, can, type Resource } from "./core-adapter";
import { forbidden, HttpError, unauthorised } from "./errors";
import { type Container, getContainer } from "./server/container";

export interface AuthContext {
  userId: string;
  orgId: string;
  role: Role;
  mayApproveReplies: boolean;
  requestId: string;
  container: Container;
}

export interface AuthorizeOptions {
  headers?: Headers;
  resource?: Resource;
}

export async function authorize(
  action: Action,
  options: AuthorizeOptions = {},
): Promise<AuthContext> {
  const container = await getContainer();
  const headers = options.headers ?? new Headers(await (await import("next/headers")).headers());
  const session = await container.auth.api.getSession({ headers });
  if (!session) throw unauthorised();

  // Sign-up's session can be made before the organisation is (Better Auth runs
  // user "after" hooks late), so fall back to the user's first membership.
  const orgId =
    (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ??
    (await firstMembershipOrg(container.database, session.user.id));
  if (!orgId) throw forbidden("You aren't a member of an organisation yet.");
  const membership = await getMembership(container.database, session.user.id, orgId);
  if (!membership) throw forbidden("You aren't a member of this organisation.");

  const subject = {
    userId: session.user.id,
    role: membership.role,
    mayApproveReplies: membership.mayApproveReplies,
  };
  if (!can(subject, action, options.resource)) throw forbidden();

  return {
    ...subject,
    orgId,
    requestId: headers.get("x-request-id") ?? randomUUID(),
    container,
  };
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * For route handlers that use the session cookie: state-changing methods
 * must come from our own origin (05 §3 CSRF), on top of SameSite=Lax.
 */
export async function authorizeRequest(
  request: Request,
  action: Action,
  resource?: Resource,
): Promise<AuthContext> {
  if (!SAFE.has(request.method)) {
    const { env } = await getContainer();
    const allowed = new Set([
      new URL(env.APP_URL).origin,
      ...(env.AUTH_TRUSTED_ORIGINS?.split(",") ?? []),
    ]);
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    const sameOrigin = origin ? allowed.has(origin) : site === "same-origin";
    if (!sameOrigin) throw new HttpError(403, "Cross-site request refused.", "csrf");
  }
  return authorize(action, { headers: request.headers, ...(resource ? { resource } : {}) });
}
