/**
 * `authorize()` opens every server action and route handler (house rule 4).
 * It resolves the session, the active organisation and the member's role,
 * asks the one policy module (`@dueproof/core`'s `authorize`, deny by
 * default) and returns the context every query needs. Data is then read with
 * `withOrg(database, ctx.orgId, …)`. Action names are core's `ACTIONS`.
 *
 *   const ctx = await authorize("document.upload");              // server action
 *   const ctx = await authorizeRequest(request, "case.view");    // route handler
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { firstMembershipOrg, getMembership } from "@dueproof/auth";
import type { Role } from "@dueproof/contracts";
import {
  type Action,
  authorize as checkPolicy,
  PolicyDenied,
  type Resource,
  type Subject,
} from "@dueproof/core";
import { forbidden, HttpError, unauthorised } from "./errors";
import { clientIdsFor } from "./org-metadata";
import { type Container, getContainer } from "./server/container";
import { getOrg } from "./server/directory";

export interface AuthContext {
  userId: string;
  orgId: string;
  role: Role;
  mayApproveReplies: boolean;
  /** Client-level access (Settings → Team): only these clients. Absent: every client. */
  clientIds?: readonly string[];
  requestId: string;
  container: Container;
}

export type { Action, Resource } from "@dueproof/core";

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

  // Owners and admins always see every client, so only look up the others.
  const clientIds =
    membership.role === "owner" || membership.role === "admin"
      ? undefined
      : clientIdsFor(
          (await getOrg(container.database, orgId))?.metadata ?? {
            profiles: [],
            languages: [],
            onboarding: {},
            clientAccess: {},
          },
          session.user.id,
        );
  const subject: Subject = {
    userId: session.user.id,
    role: membership.role,
    mayApproveReplies: membership.mayApproveReplies,
    ...(clientIds ? { clientIds } : {}),
  };
  try {
    checkPolicy(subject, action, options.resource);
  } catch (e) {
    if (e instanceof PolicyDenied) throw forbidden();
    throw e;
  }

  return {
    userId: session.user.id,
    role: membership.role,
    mayApproveReplies: membership.mayApproveReplies,
    ...(clientIds ? { clientIds } : {}),
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
