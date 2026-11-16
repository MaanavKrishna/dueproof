/**
 * Who is in an organisation, for pickers, owners, workload and digests. The
 * member and user tables belong to Better Auth and sit outside tenant RLS,
 * so these reads filter by organisation explicitly.
 */
import type { Role } from "@dueproof/contracts";
import { asc, type Database, eq, member, organization, user } from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";

export interface OrgPerson {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

/** Members of an organisation with their names and emails, by name. */
export async function listOrgPeople(database: Database, orgId: string): Promise<OrgPerson[]> {
  const raw = unsafeRawDb(database);
  const rows = await raw
    .select({ userId: member.userId, role: member.role, name: user.name, email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(asc(user.name));
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

/** Every organisation on this install, for scheduled jobs (digest, escalation). */
export async function listOrganisations(
  database: Database,
): Promise<{ id: string; name: string; logo: string | null }[]> {
  const raw = unsafeRawDb(database);
  return raw
    .select({ id: organization.id, name: organization.name, logo: organization.logo })
    .from(organization)
    .orderBy(asc(organization.createdAt));
}
