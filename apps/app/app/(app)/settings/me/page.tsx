import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PushToggle } from "@/features/push/PushToggle";
import { MeSettings } from "@/features/settings/MeSettings";
import { DENSITY_COOKIE, readPreferences, THEME_COOKIE } from "@/lib/preferences";
import { listPasskeys } from "@/lib/server/directory";
import { pageAccess, requireViewer, settingsChrome } from "@/lib/server/page";
import { getMe } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings · Me" };

export default async function MeSettingsPage() {
  const viewer = await requireViewer();
  const access = await pageAccess("team.view");
  if (!access.ok) throw new Error("no membership");
  const { ctx } = access;
  const [chrome, me, passkeys, jar] = await Promise.all([
    settingsChrome(viewer),
    getMe(ctx),
    listPasskeys(ctx.container.database, ctx.userId),
    cookies(),
  ]);
  const prefs = readPreferences({
    theme: jar.get(THEME_COOKIE)?.value,
    density: jar.get(DENSITY_COOKIE)?.value,
  });
  return (
    <MeSettings
      chrome={chrome}
      notifications={<PushToggle />}
      me={{
        name: me.name,
        email: me.email,
        role: ctx.role,
        twoFactorEnabled: me.twoFactorEnabled,
        passkeys: passkeys.map((p) => ({
          id: p.id,
          name: p.name,
          deviceType: p.deviceType,
          createdAt: p.createdAt ? p.createdAt.toISOString() : null,
        })),
        prefs: { theme: prefs.theme, density: prefs.density },
      }}
    />
  );
}
