import type { Metadata, Viewport } from "next";
// Fonts are served from this site's own files: no calls to Google Fonts.
import "@fontsource-variable/inter/wght.css";
// Indian scripts: each file declares its unicode-range, so a browser downloads
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
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: {
    default: "Dueproof: every deadline in your notices, proved on the page",
    template: "%s · Dueproof",
  },
  description:
    "Dueproof reads tax, regulatory and court notices in English and 22 Indian languages, finds what is " +
    "owed and by when, and outlines every finding on the page it came from. Self-host it free, or let us host it.",
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" data-theme="light" data-brand="ink-saffron" data-density="comfortable">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
