/**
 * Settings → Team & access (01 §3, 05 §2): members, roles, "may approve
 * replies", client-level access, invitations and removal.
 *
 * Rules on top of the policy check the caller already made (`team.manage`):
 * - Only an owner may make someone an owner, or change or remove an owner.
 * - Nobody changes their own role or removes themselves here (no lockouts).
 * - The organisation always keeps at least one owner.
 * - Viewers can never approve replies (core policy); the toggle refuses.
 * - Owners and admins always see every client; client limits are for others.
 */
import "server-only";
import { Role } from "@dueproof/contracts";
import { asc, clients, isNull, withOrg } from "@dueproof/db";
import { z } from "zod";
import type { AuthContext } from "./authorize";
import { badRequest, forbidden, notFound } from "./errors";
import { inviteLink } from "./invite-link";
import { canSendMail, mailerFor } from "./mail";
import { renderInviteEmail } from "./mail-templates";
import {
  cancelInvitation,
  createInvitation,
  deleteMember,
  getMember,
  getOrg,
  getUser,
  INVITATION_DAYS,
  type InvitationRecord,
  listMembers,
  listPendingInvitations,
  type MemberRecord,
  memberExistsByEmail,
  updateMember,
  updateOrgMetadata,
} from "./server/directory";
import { writeAudit } from "./settings";

export interface TeamMember extends MemberRecord {
  /** Client ids this member is limited to; null = every client. */
  clientIds: string[] | null;
  isYou: boolean;
}

export interface TeamInvitation extends InvitationRecord {
  /** The sign-up link with the invitation's token (the same one the email carries). */
  link: string;
}

export interface TeamView {
  members: TeamMember[];
  invitations: TeamInvitation[];
  clients: Array<{ id: string; name: string }>;
  /** What the person looking may do here. */
  canManage: boolean;
  viewerRole: Role;
}

export async function listClientsBrief(
  ctx: AuthContext,
): Promise<Array<{ id: string; name: string }>> {
  return withOrg(ctx.container.database, ctx.orgId, (tx) =>
    tx
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(isNull(clients.archivedAt))
      .orderBy(asc(clients.name))
      .limit(2000),
  );
}

export async function getTeamFor(ctx: AuthContext, canManage: boolean): Promise<TeamView> {
  const { database } = ctx.container;
  const [members, invitations, org, clientList] = await Promise.all([
    listMembers(database, ctx.orgId),
    canManage ? listPendingInvitations(database, ctx.orgId) : Promise.resolve([]),
    getOrg(database, ctx.orgId),
    canManage ? listClientsBrief(ctx) : Promise.resolve([]),
  ]);
  const access = org?.metadata.clientAccess ?? {};
  return {
    members: members.map((m) => ({
      ...m,
      clientIds: m.role === "owner" || m.role === "admin" ? null : (access[m.userId] ?? null),
      isYou: m.userId === ctx.userId,
    })),
    invitations: invitations.map((i) => ({
      ...i,
      link: inviteLink(ctx.container.env.APP_URL, ctx.container.env.AUTH_SECRET, i.id),
    })),
    clients: clientList,
    canManage,
    viewerRole: ctx.role,
  };
}

/** Owner > admin > manager > member > viewer. */
const ROLE_RANK: Record<Role, number> = { owner: 4, admin: 3, manager: 2, member: 1, viewer: 0 };

/**
 * Whether someone with `actor`'s role may give `role` to another person
 * (H2): never a role above their own, and only owners make owners.
 */
export function mayGrant(actor: Role, role: Role): boolean {
  if (role === "owner") return actor === "owner";
  return ROLE_RANK[role] <= ROLE_RANK[actor];
}

const Email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

export const InviteInput = z.object({
  emails: z.array(Email).min(1, "Enter at least one email address.").max(50),
  role: Role,
});

export interface InvitedPerson extends InvitationRecord {
  /** The sign-up link with the invitation's token (the same one the email carries). */
  link: string;
  /** Whether the invitation email went out (false without a mail server, or if it failed). */
  emailed: boolean;
}

export interface InviteResult {
  invited: InvitedPerson[];
  /** Addresses that already belong to a member. */
  skipped: string[];
}

export async function inviteFor(ctx: AuthContext, raw: unknown): Promise<InviteResult> {
  const parsed = InviteInput.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Check the addresses.");
  const { emails, role } = parsed.data;
  if (role === "owner" && ctx.role !== "owner") throw forbidden("Only an owner can invite owners.");
  if (!mayGrant(ctx.role, role)) throw forbidden("You can't invite someone above your own role.");
  const { database, env } = ctx.container;
  const [org, inviter] = await Promise.all([
    getOrg(database, ctx.orgId),
    getUser(database, ctx.userId),
  ]);
  const mailer = mailerFor(ctx.container);
  const invited: InvitedPerson[] = [];
  const skipped: string[] = [];
  for (const email of [...new Set(emails)]) {
    if (await memberExistsByEmail(database, ctx.orgId, email)) {
      skipped.push(email);
      continue;
    }
    const inv = await createInvitation(database, ctx.orgId, { email, role, inviterId: ctx.userId });
    const link = inviteLink(env.APP_URL, env.AUTH_SECRET, inv.id);
    let emailed = false;
    try {
      const sent = await mailer.send(
        renderInviteEmail({
          to: email,
          orgName: org?.name ?? "your organisation",
          inviterName: inviter?.name ?? null,
          role,
          link,
          days: INVITATION_DAYS,
        }),
      );
      emailed = sent.delivered;
    } catch {
      // The invitation stands; the admin can copy the link from Team & access.
      emailed = false;
    }
    invited.push({ ...inv, link, emailed });
    // The address is the invitation's subject; it's needed to trace who was let in.
    await writeAudit(
      ctx,
      "invitation.create",
      { role, email, emailed },
      { type: "invitation", id: inv.id },
    );
  }
  return { invited, skipped };
}

export async function cancelInviteFor(ctx: AuthContext, invitationId: unknown): Promise<void> {
  if (typeof invitationId !== "string" || !invitationId) throw badRequest("Choose an invitation.");
  const ok = await cancelInvitation(ctx.container.database, ctx.orgId, invitationId);
  if (!ok) throw notFound("That invitation");
  await writeAudit(ctx, "invitation.cancel", {}, { type: "invitation", id: invitationId });
}

async function loadTarget(ctx: AuthContext, memberId: unknown): Promise<MemberRecord> {
  if (typeof memberId !== "string" || !memberId) throw badRequest("Choose a member.");
  const target = await getMember(ctx.container.database, ctx.orgId, memberId);
  if (!target) throw notFound("That member");
  return target;
}

async function ownerCount(ctx: AuthContext): Promise<number> {
  const members = await listMembers(ctx.container.database, ctx.orgId);
  return members.filter((m) => m.role === "owner").length;
}

export async function changeRoleFor(
  ctx: AuthContext,
  memberId: unknown,
  rawRole: unknown,
): Promise<MemberRecord> {
  const role = Role.safeParse(rawRole);
  if (!role.success) throw badRequest("Choose a role.");
  const target = await loadTarget(ctx, memberId);
  if (target.userId === ctx.userId)
    throw forbidden("You can't change your own role. Ask another admin.");
  if ((role.data === "owner" || target.role === "owner") && ctx.role !== "owner")
    throw forbidden("Only an owner can make or change owners.");
  if (!mayGrant(ctx.role, role.data) || !mayGrant(ctx.role, target.role))
    throw forbidden("You can't change a role above your own.");
  if (target.role === "owner" && role.data !== "owner" && (await ownerCount(ctx)) <= 1)
    throw badRequest("The organisation needs at least one owner.");
  if (target.role === role.data) return target;
  // A viewer can never approve; others keep their current setting.
  const change: { role: Role; mayApproveReplies?: boolean } = { role: role.data };
  if (role.data === "viewer") change.mayApproveReplies = false;
  await updateMember(ctx.container.database, ctx.orgId, target.memberId, change);
  await writeAudit(
    ctx,
    "member.role.change",
    { from: target.role, to: role.data },
    { type: "user", id: target.userId },
  );
  return { ...target, ...change };
}

export async function setApproverFor(
  ctx: AuthContext,
  memberId: unknown,
  value: unknown,
): Promise<MemberRecord> {
  if (typeof value !== "boolean") throw badRequest("Choose on or off.");
  const target = await loadTarget(ctx, memberId);
  if (value && target.role === "viewer")
    throw badRequest("Viewers can't approve replies. Change their role first.");
  if (target.role === "owner" && ctx.role !== "owner")
    throw forbidden("Only an owner can change another owner's permissions.");
  await updateMember(ctx.container.database, ctx.orgId, target.memberId, {
    mayApproveReplies: value,
  });
  await writeAudit(
    ctx,
    "member.approver.change",
    { mayApproveReplies: value },
    { type: "user", id: target.userId },
  );
  return { ...target, mayApproveReplies: value };
}

export const ClientAccessInput = z.array(z.string().min(1).max(64)).max(10_000).nullable();

export async function setClientAccessFor(
  ctx: AuthContext,
  memberId: unknown,
  raw: unknown,
): Promise<{ clientIds: string[] | null }> {
  const parsed = ClientAccessInput.safeParse(raw);
  if (!parsed.success) throw badRequest("Choose clients from the list.");
  const target = await loadTarget(ctx, memberId);
  if (target.role === "owner" || target.role === "admin")
    throw badRequest("Owners and admins always see every client.");
  let clientIds: string[] | null = null;
  if (parsed.data) {
    const known = new Set((await listClientsBrief(ctx)).map((c) => c.id));
    clientIds = [...new Set(parsed.data)].filter((id) => known.has(id));
  }
  await updateOrgMetadata(ctx.container.database, ctx.orgId, (m) => {
    const clientAccess = { ...m.clientAccess };
    if (clientIds === null) delete clientAccess[target.userId];
    else clientAccess[target.userId] = clientIds;
    return { ...m, clientAccess };
  });
  await writeAudit(
    ctx,
    "member.client_access.change",
    { clients: clientIds === null ? "all" : clientIds.length },
    { type: "user", id: target.userId },
  );
  return { clientIds };
}

export async function removeMemberFor(ctx: AuthContext, memberId: unknown): Promise<void> {
  const target = await loadTarget(ctx, memberId);
  if (target.userId === ctx.userId)
    throw forbidden("You can't remove yourself. Ask another admin.");
  if (target.role === "owner") {
    if (ctx.role !== "owner") throw forbidden("Only an owner can remove an owner.");
    if ((await ownerCount(ctx)) <= 1)
      throw badRequest("The organisation needs at least one owner.");
  }
  await deleteMember(ctx.container.database, ctx.orgId, target.memberId);
  await updateOrgMetadata(ctx.container.database, ctx.orgId, (m) => {
    const clientAccess = { ...m.clientAccess };
    delete clientAccess[target.userId];
    return { ...m, clientAccess };
  });
  await writeAudit(
    ctx,
    "member.remove",
    { role: target.role },
    { type: "user", id: target.userId },
  );
}

/**
 * Emails a member a password reset link (Better Auth's reset, through the
 * mail driver). The admin never sees the link: only the member's inbox gets
 * it. Refused when the install has no mail server, since nothing would arrive.
 */
export async function sendPasswordResetFor(ctx: AuthContext, memberId: unknown): Promise<void> {
  const target = await loadTarget(ctx, memberId);
  if (target.userId === ctx.userId)
    throw badRequest("To reset your own password, use “Forgot password?” on the sign-in page.");
  if (target.role === "owner" && ctx.role !== "owner")
    throw forbidden("Only an owner can send an owner a reset link.");
  if (!canSendMail(ctx.container))
    throw badRequest(
      "This install can't send email yet. An administrator of the server can set it up (MAIL_DRIVER).",
    );
  await ctx.container.auth.api.requestPasswordReset({
    body: { email: target.email, redirectTo: "/reset-password" },
  });
  await writeAudit(ctx, "member.password_reset.send", {}, { type: "user", id: target.userId });
}
