/**
 * The signed-in app: everything under it needs a session (else sign-in,
 * coming back here afterwards) and renders inside the app frame.
 */
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { AppFrame } from "@/features/shell/AppFrame";
import { DENSITY_COOKIE, readPreferences, THEME_COOKIE } from "@/lib/preferences";
import { requireViewer } from "@/lib/server/page";

// Per request: reads the session and the CSP nonce.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [viewer, jar] = await Promise.all([requireViewer(), cookies()]);
  const { theme, density } = readPreferences({
    theme: jar.get(THEME_COOKIE)?.value,
    density: jar.get(DENSITY_COOKIE)?.value,
  });
  return (
    <AppFrame
      viewer={{
        name: viewer.name,
        email: viewer.email,
        orgName: viewer.orgName,
        role: viewer.role,
      }}
      prefs={{ theme, density }}
    >
      {children}
    </AppFrame>
  );
}
