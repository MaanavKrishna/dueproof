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
  manager: ac.newRole({ invitation: ["create", "cancel"] }),
  member: ac.newRole({}),
  viewer: ac.newRole({}),
} satisfies Record<Role, unknown>;

/** Roles that get "may approve replies" when they join, unless changed (D-prod-2). */
export const APPROVER_ROLES_BY_DEFAULT: readonly Role[] = ["owner", "admin", "manager"];
