import { can } from "@dueproof/core";
import type { Metadata } from "next";
import { TeamSettings } from "@/features/settings/TeamSettings";
import { ssoSettingsFor } from "@/lib/business";
import { pageAccess, requireViewer, settingsChrome } from "@/lib/server/page";
import { getTeamFor } from "@/lib/team";

export const metadata: Metadata = { title: "Settings · Team & access" };

export default async function TeamSettingsPage() {
  const viewer = await requireViewer();
  const [chrome, access] = await Promise.all([settingsChrome(viewer), pageAccess("team.view")]);
  if (!access.ok) throw new Error("no membership");
  const { ctx } = access;
  const canManage = can({ userId: ctx.userId, role: ctx.role }, "team.manage");
  const [team, sso] = await Promise.all([getTeamFor(ctx, canManage), ssoSettingsFor(ctx)]);
  return (
    <TeamSettings
      chrome={chrome}
      data={{
        members: team.members.map((m) => ({
          memberId: m.memberId,
          userId: m.userId,
          name: m.name,
          email: m.email,
          role: m.role,
          mayApproveReplies: m.mayApproveReplies,
          twoFactorEnabled: m.twoFactorEnabled,
          clientIds: m.clientIds,
          isYou: m.isYou,
        })),
        invitations: team.invitations.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt.toISOString(),
        })),
        clients: team.clients,
        canManage,
        viewerRole: ctx.role,
        appUrl: ctx.container.env.APP_URL,
        ...(sso.licensed && sso.serviceProvider
          ? {
              sso: {
                providers: sso.providers,
                serviceProvider: sso.serviceProvider,
                canManage,
              },
            }
          : {}),
      }}
    />
  );
}
