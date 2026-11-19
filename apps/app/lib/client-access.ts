/**
 * Client-level access (Settings → Team), in one place. A member limited to
 * some clients sees and changes only those clients' work, plus work not yet
 * tied to a client (an inbox upload). Owners and admins, and members with no
 * limit, see every client.
 *
 * - `resolveClientIds` works out the caller's allowed clients. `authorize()`
 *   puts the answer in `ctx.clientIds`; the calendar feed uses it directly.
 * - `clientScope` is the SQL condition for queries that list things.
 * - `requireClient` is for a row loaded by id: outside the caller's clients
 *   it is "not found" (its existence is not disclosed), and then the action
 *   is checked against the row's client by core's policy.
 */
import "server-only";
import type { Role } from "@dueproof/contracts";
import { type Action, can } from "@dueproof/core";
import {
  and,
  cases,
  clients,
  type Database,
  eq,
  inArray,
  isNull,
  type OrgTx,
  or,
} from "@dueproof/db";
import type { AuthContext } from "./authorize";
import { badRequest, forbidden, notFound } from "./errors";
import { clientIdsFor } from "./org-metadata";
import { getOrg } from "./server/directory";

type Column = Parameters<typeof isNull>[0];
type Scoped = Pick<AuthContext, "clientIds">;

/** The clients a member may work on, or undefined for every client. */
export async function resolveClientIds(
  database: Database,
  orgId: string,
  userId: string,
  role: Role,
): Promise<readonly string[] | undefined> {
  // Owners and admins always see every client, so only look up the others.
  if (role === "owner" || role === "admin") return undefined;
  const org = await getOrg(database, orgId);
  return org ? clientIdsFor(org.metadata, userId) : undefined;
}

/** SQL condition: rows for no client, or for one of the caller's clients. Undefined = no limit. */
export function clientScope(ctx: Scoped, column: Column): ReturnType<typeof or> {
  if (!ctx.clientIds) return undefined;
  if (!ctx.clientIds.length) return isNull(column);
  return or(isNull(column), inArray(column, [...ctx.clientIds]));
}

/** Whether the caller may see work for this client (null: not tied to a client yet). */
export function clientAllowed(ctx: Scoped, clientId: string | null | undefined): boolean {
  return !ctx.clientIds || !clientId || ctx.clientIds.includes(clientId);
}

/**
 * For a row loaded by id. Outside the caller's clients it is "not found";
 * otherwise the action is checked against its client (403 if refused).
 */
export function requireClient(
  ctx: AuthContext,
  action: Action,
  clientId: string | null | undefined,
  what = "That item",
): void {
  if (!clientAllowed(ctx, clientId)) throw notFound(what);
  if (!can(ctx, action, clientId ? { clientId } : {})) throw forbidden();
}

/**
 * Where an upload is filed: the case and client must be this
 * organisation's and the caller's. Foreign keys are not subject to row-level
 * security, so they are looked up here; the client follows the case.
 */
export async function uploadTarget(
  tx: OrgTx,
  ctx: AuthContext,
  input: { caseId?: string | undefined; clientId?: string | undefined },
): Promise<{ caseId: string | null; clientId: string | null }> {
  let clientId = input.clientId ?? null;
  if (input.caseId) {
    const [c] = await tx
      .select({ clientId: cases.clientId })
      .from(cases)
      .where(and(eq(cases.orgId, ctx.orgId), eq(cases.id, input.caseId)))
      .limit(1);
    if (!c) throw notFound("That case");
    if (clientId && c.clientId && clientId !== c.clientId)
      throw badRequest("That case is for another client.");
    clientId = c.clientId ?? clientId;
  }
  if (clientId) {
    const [cl] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.orgId, ctx.orgId), eq(clients.id, clientId)))
      .limit(1);
    if (!cl) throw notFound("That client");
  }
  requireClient(ctx, "document.upload", clientId, "That client");
  return { caseId: input.caseId ?? null, clientId };
}
