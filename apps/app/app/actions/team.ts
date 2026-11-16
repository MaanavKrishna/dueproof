"use server";
/**
 * Server actions for Settings → Team & access. Each needs `team.manage`
 * (owners and admins); the extra owner and self rules are in lib/team.ts.
 * Every change is audited.
 *
 *   await inviteMembers({ emails: ["rahul@firm.in"], role: "member" });
 *   await changeMemberRole(memberId, "manager");
 *   await setMemberApprover(memberId, true);
 *   await setMemberClientAccess(memberId, ["client-id", …]);   // null = every client
 *   await sendMemberPasswordReset(memberId);                    // emails them a reset link
 */
import { type ActionResult, runAction } from "@/lib/action-result";
import { authorize } from "@/lib/authorize";
import {
  cancelInviteFor,
  changeRoleFor,
  type InviteResult,
  inviteFor,
  removeMemberFor,
  sendPasswordResetFor,
  setApproverFor,
  setClientAccessFor,
} from "@/lib/team";

export async function inviteMembers(input: unknown): Promise<ActionResult<InviteResult>> {
  return runAction("invite", async () => inviteFor(await authorize("team.manage"), input));
}

export async function cancelInvitation(invitationId: string): Promise<ActionResult<null>> {
  return runAction("cancel invitation", async () => {
    await cancelInviteFor(await authorize("team.manage"), invitationId);
    return null;
  });
}

export async function changeMemberRole(
  memberId: string,
  role: string,
): Promise<ActionResult<{ role: string; mayApproveReplies: boolean }>> {
  return runAction("change role", async () => {
    const m = await changeRoleFor(await authorize("team.manage"), memberId, role);
    return { role: m.role, mayApproveReplies: m.mayApproveReplies };
  });
}

export async function setMemberApprover(
  memberId: string,
  value: boolean,
): Promise<ActionResult<{ mayApproveReplies: boolean }>> {
  return runAction("approver", async () => {
    const m = await setApproverFor(await authorize("team.manage"), memberId, value);
    return { mayApproveReplies: m.mayApproveReplies };
  });
}

export async function setMemberClientAccess(
  memberId: string,
  clientIds: string[] | null,
): Promise<ActionResult<{ clientIds: string[] | null }>> {
  return runAction("client access", async () =>
    setClientAccessFor(await authorize("team.manage"), memberId, clientIds),
  );
}

export async function removeMember(memberId: string): Promise<ActionResult<null>> {
  return runAction("remove member", async () => {
    await removeMemberFor(await authorize("team.manage"), memberId);
    return null;
  });
}

export async function sendMemberPasswordReset(memberId: string): Promise<ActionResult<null>> {
  return runAction("send reset link", async () => {
    await sendPasswordResetFor(await authorize("team.manage"), memberId);
    return null;
  });
}
