import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAiSettings } from "@/app/actions/ai-settings";
import { SetupWizard } from "@/features/setup/SetupWizard";
import type { AiModeId } from "@/lib/ai-options";
import { pageAccess, requireViewer } from "@/lib/server/page";
import { getOrganisationFor } from "@/lib/settings";

// Per request: reads the session and the CSP nonce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set up Dueproof" };

/** First-run setup. Owners and admins only; everyone else goes to Today. */
export default async function WelcomePage() {
  await requireViewer();
  const access = await pageAccess("org.manage_settings");
  if (!access.ok) redirect("/today");
  const { ctx } = access;
  const [org, ai] = await Promise.all([getOrganisationFor(ctx), getAiSettings()]);
  return (
    <SetupWizard
      initial={{
        name: org.name,
        country: org.country,
        timezone: org.timezone,
        fiscalYearStartMonth: org.fiscalYearStartMonth,
        profiles: org.profiles,
        languages: org.languages,
        aiMode: (ai.ok ? ai.data.mode : "off") as AiModeId,
        aiProvider: ai.ok ? ai.data.provider : null,
        canStoreKey: ai.ok ? ai.data.canStoreKey : false,
        edition: ctx.container.env.DUEPROOF_EDITION,
        appUrl: ctx.container.env.APP_URL,
      }}
    />
  );
}
