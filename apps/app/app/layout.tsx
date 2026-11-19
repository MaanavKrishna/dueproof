// Fonts come from this app's own files: no calls to Google Fonts, so
// self-hosted and desktop installs work offline (02 §5).
import "@fontsource-variable/inter/wght.css";
// Indian scripts: each file declares its unicode-range, so the browser fetches
// a script's font only when a page shows characters from it.
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-bengali/400.css";
import "@fontsource/noto-sans-tamil/400.css";
import "@fontsource/noto-sans-telugu/400.css";
import "@fontsource/noto-sans-malayalam/400.css";
import "@fontsource/noto-sans-kannada/400.css";
import "@fontsource/noto-sans-gujarati/400.css";
import "@fontsource/noto-sans-gurmukhi/400.css";
import "@fontsource/noto-sans-oriya/400.css";
import "@fontsource/noto-sans-ol-chiki/400.css";
import "@fontsource/noto-sans-meetei-mayek/400.css";
import "@fontsource/noto-naskh-arabic/400.css";
import "@dueproof/ui/styles.css";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { DENSITY_COOKIE, noFlashScript, readPreferences, THEME_COOKIE } from "@/lib/preferences";
import { STYLE_NONCE_SCRIPT } from "@/lib/security/headers";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Dueproof", template: "%s · Dueproof" },
  description: "Every deadline in your notices, proved on the page.",
  robots: { index: false, follow: false },
  // Without these, browsers ask for /favicon.ico on every page, and get a 404.
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Render per request: the CSP nonce (proxy.ts) only reaches pages rendered
  // after the request arrives, never prerendered ones (05 §3).
  await connection();
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const nonce = h.get("x-nonce") ?? undefined;
  const prefs = readPreferences({
    theme: jar.get(THEME_COOKIE)?.value,
    density: jar.get(DENSITY_COOKIE)?.value,
  });
  return (
    <html
      lang="en-IN"
      data-theme={prefs.theme}
      data-brand="ink-saffron"
      data-density={prefs.density}
      data-prefs={prefs.fromCookie ? "cookie" : "default"}
      suppressHydrationWarning
    >
      <head>
        <script
          nonce={nonce}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed script built from allow-lists, run before paint.
          dangerouslySetInnerHTML={{ __html: noFlashScript() }}
        />
        <script
          nonce={nonce}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string; passes the nonce on to run-time styles.
          dangerouslySetInnerHTML={{ __html: STYLE_NONCE_SCRIPT }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
