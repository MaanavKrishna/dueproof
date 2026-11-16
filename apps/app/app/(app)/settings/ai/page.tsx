import type { Metadata } from "next";
import { getAiSettings } from "@/app/actions/ai-settings";
import { AiSettings } from "@/features/settings/AiSettings";
import { NoAccessSettings } from "@/features/settings/NoAccessSettings";
import { pageAccess, requireViewer, settingsChrome } from "@/lib/server/page";
import { listClientsBrief } from "@/lib/team";

export const metadata: Metadata = { title: "Settings · AI" };

export default async function AiSettingsPage() {
  const viewer = await requireViewer();
  const [chrome, access] = await Promise.all([
    settingsChrome(viewer),
    pageAccess("ai.manage_settings"),
  ]);
  if (!access.ok)
    return (
      <NoAccessSettings chrome={chrome} section="ai" what="AI settings" admins={access.admins} />
    );
  const [ai, clients] = await Promise.all([getAiSettings(), listClientsBrief(access.ctx)]);
  if (!ai.ok) throw new Error(ai.error);
  return (
    <AiSettings
      chrome={chrome}
      data={ai.data}
      clients={clients}
      edition={access.ctx.container.env.DUEPROOF_EDITION}
    />
  );
}
