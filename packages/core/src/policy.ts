/**
 * The one policy module (05 §2): deny by default, roles plus optional
 * client-level grants, and a separate "may approve replies" permission that
 * is never usable by the person who asked for the approval (D-prod-2).
 *
 * Pure: the caller loads the subject (member row) and the resource facts;
 * this decides. Every server action starts with `authorize(…)` (house rule 4).
 */
import type { Role } from "@dueproof/contracts";

export const ACTIONS = [
  // cases and documents
  "case.view",
  "case.create",
  "case.edit",
  "case.assign",
  "case.change_stage",
  "case.comment",
  "document.upload",
  "finding.review",
  "deadline.edit",
  "reply.draft",
  "reply.request_approval",
  "reply.approve",
  "reply.skip_approval",
  // clients and the calendar
  "client.view",
  "client.edit",
  "statutory.override",
  "exposure.view",
  // AI
  "ai.use",
  "ai.manage_settings",
  // organisation
  "team.view",
  "team.manage",
  "org.manage_settings",
  "billing.manage",
  "data.export",
  "audit.view",
  "report.view",
] as const;
export type Action = (typeof ACTIONS)[number];

export const ROLES: readonly Role[] = ["owner", "admin", "manager", "member", "viewer"];

const VIEW: readonly Action[] = ["case.view", "client.view", "report.view", "team.view"];
const WORK: readonly Action[] = [
  ...VIEW,
  "case.create",
  "case.edit",
  "case.change_stage",
  "case.comment",
  "document.upload",
  "finding.review",
  "deadline.edit",
  "reply.draft",
  "reply.request_approval",
  "ai.use",
];
const MANAGE: readonly Action[] = [
  ...WORK,
  "case.assign",
  "client.edit",
  "statutory.override",
  "exposure.view",
  "reply.approve",
  "reply.skip_approval",
  "data.export",
];
const ADMIN: readonly Action[] = [
  ...MANAGE,
  "team.manage",
  "ai.manage_settings",
  "org.manage_settings",
  "audit.view",
];

/**
 * The default role × action grants. `reply.approve` is listed for the roles
 * that hold "may approve replies" by default; the permission can be granted
 * to or withdrawn from a member individually.
 */
export const ROLE_GRANTS: Readonly<Record<Role, ReadonlySet<Action>>> = {
  owner: new Set<Action>([...ADMIN, "billing.manage"]),
  admin: new Set<Action>(ADMIN),
  manager: new Set<Action>(MANAGE),
  member: new Set<Action>(WORK),
  viewer: new Set<Action>(VIEW),
};

/** Roles that may approve replies unless the organisation says otherwise. */
export const DEFAULT_APPROVERS: ReadonlySet<Role> = new Set<Role>(["owner", "admin", "manager"]);

/** Actions that concern one client's work, and so are limited by client-level grants. */
const CLIENT_SCOPED = new Set<Action>([
  "case.view",
  "case.create",
  "case.edit",
  "case.assign",
  "case.change_stage",
  "case.comment",
  "document.upload",
  "finding.review",
  "deadline.edit",
  "reply.draft",
  "reply.request_approval",
  "reply.approve",
  "reply.skip_approval",
  "client.view",
  "client.edit",
  "statutory.override",
  "exposure.view",
  "ai.use",
]);

export interface Subject {
  userId: string;
  role: Role;
  /**
   * Overrides the role default for "may approve replies" (Settings →
   * Organisation). Never makes a viewer an approver.
   */
  mayApproveReplies?: boolean;
  /**
   * Client-level access. Absent: all clients. Present: only these clients,
   * for client-scoped actions. Owners and admins always see every client.
   */
  clientIds?: readonly string[];
}

export interface Resource {
  /** The client the case/document/deadline belongs to, if any. */
  clientId?: string;
  /** For reply.approve: who asked for the approval. */
  requestedBy?: string;
}

export function mayApproveReplies(subject: Subject): boolean {
  if (subject.role === "viewer") return false;
  return subject.mayApproveReplies ?? DEFAULT_APPROVERS.has(subject.role);
}

function clientAllowed(subject: Subject, resource: Resource): boolean {
  if (subject.role === "owner" || subject.role === "admin") return true;
  if (!subject.clientIds) return true;
  // A restricted subject acting on something with no client (an inbox upload)
  // is allowed; anything tied to a client must be on their list.
  if (resource.clientId === undefined) return true;
  return subject.clientIds.includes(resource.clientId);
}

/** Deny by default. */
export function can(subject: Subject, action: Action, resource: Resource = {}): boolean {
  if (!(ACTIONS as readonly string[]).includes(action)) return false;
  if (!ROLES.includes(subject.role)) return false;
  if (action === "reply.approve") {
    if (!mayApproveReplies(subject)) return false;
    // Never the person who asked; an approval with no recorded requester is refused.
    if (resource.requestedBy === undefined || resource.requestedBy === subject.userId) return false;
  } else if (!ROLE_GRANTS[subject.role].has(action)) {
    return false;
  }
  if (CLIENT_SCOPED.has(action) && !clientAllowed(subject, resource)) return false;
  return true;
}

export class PolicyDenied extends Error {
  override name = "PolicyDenied";
  constructor(
    readonly action: Action,
    readonly userId: string,
  ) {
    super(`Not allowed: ${action}`);
  }
}

/** Throws PolicyDenied unless `can(…)`. Call first in every server action and route handler. */
export function authorize(subject: Subject, action: Action, resource: Resource = {}): void {
  if (!can(subject, action, resource)) throw new PolicyDenied(action, subject.userId);
}

/** Role × action matrix with default settings and no client restriction, for docs and tests. */
export function policyMatrix(): Record<Role, Record<Action, boolean>> {
  const out = {} as Record<Role, Record<Action, boolean>>;
  for (const role of ROLES) {
    const row = {} as Record<Action, boolean>;
    for (const action of ACTIONS) {
      row[action] = can({ userId: "subject", role }, action, { requestedBy: "someone-else" });
    }
    out[role] = row;
  }
  return out;
}
