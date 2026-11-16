import type { Metadata } from "next";
import { NoAccessSettings } from "@/features/settings/NoAccessSettings";
import { OrganisationSettings } from "@/features/settings/OrganisationSettings";
import { listMembers } from "@/lib/server/directory";
import { pageAccess, requireViewer, settingsChrome } from "@/lib/server/page";
import { getOrganisationFor } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings · Organisation" };

export default async function OrganisationSettingsPage() {
  const viewer = await requireViewer();
  const [chrome, access] = await Promise.all([
    settingsChrome(viewer),
    pageAccess("org.manage_settings"),
  ]);
  if (!access.ok)
    return (
      <NoAccessSettings
        chrome={chrome}
        section="organisation"
        what="Organisation settings"
        admins={access.admins}
      />
    );
  const { ctx } = access;
  const [org, members] = await Promise.all([
    getOrganisationFor(ctx),
    listMembers(ctx.container.database, ctx.orgId),
  ]);
  return (
    <OrganisationSettings
      chrome={chrome}
      data={{
        name: org.name,
        country: org.country,
        timezone: org.timezone,
        fiscalYearStartMonth: org.fiscalYearStartMonth,
        workingDays: org.workingDays,
        escalationDays: org.escalationDays,
        reportLogoUrl: org.reportLogoUrl,
        hasReportLogo: org.hasReportLogo,
        holidays: org.holidays,
        approvers: members
          .filter((m) => m.mayApproveReplies && m.role !== "viewer")
          .map((m) => ({ name: m.name, role: m.role })),
      }}
    />
  );
}
