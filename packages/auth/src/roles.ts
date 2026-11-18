/**
 * Better Auth organisation roles. These govern who may manage the
 * organisation itself (invite, change roles, remove members). Everything
 * about documents, cases and deadlines is decided by the domain policy
 * (`can()` in packages/core), which reads the same role from the member row.
 */
import type { Role } from "@dueproof/contracts";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

export const ac = createAccessControl(defaultStatements);

export const roles = {
  owner: ac.newRole({
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    team: ["create", "update", "delete"],
    ac: ["create", "read", "update", "delete"],
  }),
  admin: ac.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    team: ["create", "update", "delete"],
    ac: ["create", "read", "update", "delete"],
  }),
  // Managers don't invite (H2): the app's team actions need `team.manage`
  // (owners and admins), and Better Auth's own endpoints are closed over HTTP.
  manager: ac.newRole({}),
  member: ac.newRole({}),
  viewer: ac.newRole({}),
} satisfies Record<Role, unknown>;

/** Roles that get "may approve replies" when they join, unless changed (D-prod-2). */
export const APPROVER_ROLES_BY_DEFAULT: readonly Role[] = ["owner", "admin", "manager"];
