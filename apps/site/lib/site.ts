export const REPO = "https://github.com/MaanavKrishna/dueproof";

/** What people can run today, and what this site describes. */
export const RELEASED = "v0.1 beta";
/** The hosted app. */
export const APP_URL = "https://dueproof-app.vercel.app";

export const LICENCE = {
  name: "PolyForm Shield 1.0.0",
  short: "Source-available under PolyForm Shield 1.0.0.",
  long:
    "Source-available under the PolyForm Shield License 1.0.0. Free to use, self-host, change " +
    "and improve. You may not sell it or offer it as a competing product or service.",
} as const;

export const NAV = [
  { href: "/product/", label: "Product" },
  { href: "/use-cases/", label: "Use cases" },
  { href: "/languages/", label: "Languages" },
  { href: "/security/", label: "Security" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/docs/", label: "Docs" },
] as const;
