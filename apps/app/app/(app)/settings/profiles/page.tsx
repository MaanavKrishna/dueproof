import type { Metadata } from "next";
import { NoAccessSettings } from "@/features/settings/NoAccessSettings";
import { ProfilesSettings } from "@/features/settings/ProfilesSettings";
import { pageAccess, requireViewer, settingsChrome } from "@/lib/server/page";
import { getOrganisationFor } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings · Profiles" };

export default async function ProfilesSettingsPage() {
  const viewer = await requireViewer();
  const [chrome, access] = await Promise.all([
    settingsChrome(viewer),
    pageAccess("org.manage_settings"),
  ]);
  if (!access.ok)
    return (
      <NoAccessSettings
        chrome={chrome}
        section="profiles"
        what="Notice types"
        admins={access.admins}
      />
    );
  const org = await getOrganisationFor(access.ctx);
  return <ProfilesSettings chrome={chrome} profiles={org.profiles} languages={org.languages} />;
}
