/**
 * The people directory: Better Auth's own tables (organization, member,
 * invitation, user, passkey). They have no org_id RLS policy (Better Auth
 * reads them across organisations), so the app role can't reach them inside
 * withOrg(). This module is the one place the app reads and writes them, and
 * every query here is filtered by the organisation id the caller was
 * authorised for. Callers authorise first and write the audit entry.
 */
import "server-only";
import type { Role } from "@dueproof/contracts";
import {
  and,
  asc,
  type Database,
  eq,
  gt,
  invitation,
  member,
  organization,
  passkey,
  sql,
  user,
  uuidv7,
} from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { type OrgMetadata, parseOrgMetadata, serialiseOrgMetadata } from "../org-metadata";

export interface OrgRecord {
  id: string;
  name: string;
  metadata: OrgMetadata;
  createdAt: Date;
}

export async function getOrg(database: Database, orgId: string): Promise<OrgRecord | null> {
  const [row] = await unsafeRawDb(database)
    .select()
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    metadata: parseOrgMetadata(row.metadata),
    createdAt: row.createdAt,
  };
}

export async function renameOrg(database: Database, orgId: string, name: string): Promise<void> {
  await unsafeRawDb(database).update(organization).set({ name }).where(eq(organization.id, orgId));
}

/**
 * Read-modify-write of the metadata JSON under a row lock, so two saves at
 * once don't lose each other's changes.
 */
export async function updateOrgMetadata(
  database: Database,
  orgId: string,
  change: (meta: OrgMetadata) => OrgMetadata,
): Promise<OrgMetadata> {
  return unsafeRawDb(database).transaction(async (tx) => {
    const [row] = await tx
      .select({ metadata: organization.metadata })
      .from(organization)
      .where(eq(organization.id, orgId))
      .for("update")
      .limit(1);
    if (!row) throw new Error("organisation missing");
    const next = change(parseOrgMetadata(row.metadata));
    await tx
      .update(organization)
      .set({ metadata: serialiseOrgMetadata(next) })
      .where(eq(organization.id, orgId));
    return next;
  });
}

export interface MemberRecord {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  mayApproveReplies: boolean;
  twoFactorEnabled: boolean;
  joinedAt: Date;
}

export async function listMembers(database: Database, orgId: string): Promise<MemberRecord[]> {
  const rows = await unsafeRawDb(database)
    .select({
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      mayApproveReplies: member.mayApproveReplies,
      joinedAt: member.createdAt,
      name: user.name,
      email: user.email,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(asc(member.createdAt));
  return rows.map((r) => ({
    ...r,
    role: r.role as Role,
    mayApproveReplies: r.mayApproveReplies ?? false,
    twoFactorEnabled: r.twoFactorEnabled ?? false,
  }));
}

export async function getMember(
  database: Database,
  orgId: string,
  memberId: string,
): Promise<MemberRecord | null> {
  const all = await listMembers(database, orgId);
  return all.find((m) => m.memberId === memberId) ?? null;
}

export async function updateMember(
  database: Database,
  orgId: string,
  memberId: string,
  change: { role?: Role; mayApproveReplies?: boolean },
): Promise<void> {
  if (Object.keys(change).length === 0) return;
  await unsafeRawDb(database)
    .update(member)
    .set(change)
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)));
}

export async function deleteMember(
  database: Database,
  orgId: string,
  memberId: string,
): Promise<void> {
  await unsafeRawDb(database)
    .delete(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)));
}

export interface InvitationRecord {
  id: string;
  email: string;
  role: Role;
  expiresAt: Date;
  createdAt: Date;
}

export async function listPendingInvitations(
  database: Database,
  orgId: string,
): Promise<InvitationRecord[]> {
  const rows = await unsafeRawDb(database)
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, orgId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.createdAt));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: (r.role ?? "member") as Role,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }));
}

/** Invitations last 14 days (05 §3a). */
export const INVITATION_DAYS = 14;

export async function createInvitation(
  database: Database,
  orgId: string,
  input: { email: string; role: Role; inviterId: string },
): Promise<InvitationRecord> {
  const raw = unsafeRawDb(database);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  // One pending invitation per address: a new one replaces the old.
  await raw
    .update(invitation)
    .set({ status: "canceled" })
    .where(
      and(
        eq(invitation.organizationId, orgId),
        eq(invitation.status, "pending"),
        sql`lower(${invitation.email}) = lower(${input.email})`,
      ),
    );
  const id = uuidv7();
  await raw.insert(invitation).values({
    id,
    organizationId: orgId,
    email: input.email,
    role: input.role,
    status: "pending",
    expiresAt,
    createdAt: now,
    inviterId: input.inviterId,
  });
  return { id, email: input.email, role: input.role, expiresAt, createdAt: now };
}

export async function cancelInvitation(
  database: Database,
  orgId: string,
  invitationId: string,
): Promise<boolean> {
  const rows = await unsafeRawDb(database)
    .update(invitation)
    .set({ status: "canceled" })
    .where(
      and(
        eq(invitation.id, invitationId),
        eq(invitation.organizationId, orgId),
        eq(invitation.status, "pending"),
      ),
    )
    .returning({ id: invitation.id });
  return rows.length > 0;
}

/** A pending invitation for this address, with its organisation's name (sign-up page). */
export async function findInvitationByEmail(
  database: Database,
  email: string,
): Promise<{ orgName: string; role: Role } | null> {
  const [row] = await unsafeRawDb(database)
    .select({ orgName: organization.name, role: invitation.role })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(
      and(
        sql`lower(${invitation.email}) = lower(${email})`,
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.createdAt))
    .limit(1);
  return row ? { orgName: row.orgName, role: (row.role ?? "member") as Role } : null;
}

export async function memberExistsByEmail(
  database: Database,
  orgId: string,
  email: string,
): Promise<boolean> {
  const [row] = await unsafeRawDb(database)
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, orgId), sql`lower(${user.email}) = lower(${email})`))
    .limit(1);
  return Boolean(row);
}

export interface PasskeyRecord {
  id: string;
  name: string | null;
  deviceType: string;
  createdAt: Date | null;
}

export async function listPasskeys(database: Database, userId: string): Promise<PasskeyRecord[]> {
  return unsafeRawDb(database)
    .select({
      id: passkey.id,
      name: passkey.name,
      deviceType: passkey.deviceType,
      createdAt: passkey.createdAt,
    })
    .from(passkey)
    .where(eq(passkey.userId, userId))
    .orderBy(asc(passkey.createdAt));
}

export async function getUser(
  database: Database,
  userId: string,
): Promise<{ id: string; name: string; email: string; twoFactorEnabled: boolean } | null> {
  const [row] = await unsafeRawDb(database)
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ? { ...row, twoFactorEnabled: row.twoFactorEnabled ?? false } : null;
}

export async function renameUser(database: Database, userId: string, name: string): Promise<void> {
  await unsafeRawDb(database)
    .update(user)
    .set({ name, updatedAt: new Date() })
    .where(eq(user.id, userId));
}
