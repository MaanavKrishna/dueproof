import type { Metadata, Viewport } from "next";
import {
  Archivo, Noto_Naskh_Arabic, Noto_Sans_Bengali, Noto_Sans_Devanagari, Noto_Sans_Gujarati,
  Noto_Sans_Gurmukhi, Noto_Sans_Kannada, Noto_Sans_Malayalam, Noto_Sans_Meetei_Mayek,
  Noto_Sans_Ol_Chiki, Noto_Sans_Oriya, Noto_Sans_Tamil, Noto_Sans_Telugu,
} from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-archivo" });

// Indian scripts load only where a page uses their characters.
const deva = Noto_Sans_Devanagari({ weight: ["400", "600"], display: "swap", preload: false, variable: "--font-deva" });
const beng = Noto_Sans_Bengali({ weight: ["400", "600"], display: "swap", preload: false, variable: "--font-beng" });
const taml = Noto_Sans_Tamil({ weight: ["400", "600"], display: "swap", preload: false, variable: "--font-taml" });
const telu = Noto_Sans_Telugu({ weight: ["400", "600"], display: "swap", preload: false, variable: "--font-telu" });
const mlym = Noto_Sans_Malayalam({ weight: ["400", "600"], display: "swap", preload: false, variable: "--font-mlym" });
const knda = Noto_Sans_Kannada({ weight: ["400", "600"], display: "swap", preload: false, variable: "--font-knda" });
const gujr = Noto_Sans_Gujarati({ weight: ["400", "600"], display: "swap", preload: false, variable: "--font-gujr" });
const guru = Noto_Sans_Gurmukhi({ weight: ["400", "600"], display: "swap", preload: false, variable: "--font-guru" });
const orya = Noto_Sans_Oriya({ weight: ["400", "600"], display: "swap", preload: false, variable: "--font-orya" });
const olck = Noto_Sans_Ol_Chiki({ weight: ["400", "600"], display: "swap", preload: false, variable: "--font-olck" });
const mtei = Noto_Sans_Meetei_Mayek({ weight: ["400", "600"], display: "swap", preload: false, variable: "--font-mtei" });
const arab = Noto_Naskh_Arabic({ weight: ["400", "600"], display: "swap", preload: false, variable: "--font-arab" });

const fonts = [archivo, deva, beng, taml, telu, mlym, knda, gujr, guru, orya, olck, mtei, arab]
  .map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: { default: "Dueproof: every deadline in your notices, with proof from the page", template: "%s | Dueproof" },
  description:
    "Open-source, self-hosted. Dueproof reads tax, regulatory and court notices in English and 22 Indian " +
    "languages and keeps a deadline register, with every entry outlined on the page it came from.",
};

export const viewport: Viewport = { themeColor: "#0d3a2e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fonts} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
