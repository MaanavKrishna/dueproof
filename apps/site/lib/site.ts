export const REPO = "https://github.com/MaanavKrishna/dueproof";

/** What people can run today, and what this site describes. */
export const RELEASED = "v0.1 beta";
/** The hosted app. */
export const APP_URL = "https://dueproof-app.vercel.app";

export const LICENCE = {
  name: "FSL-1.1-ALv2",
  short: "Source-available under FSL-1.1-ALv2.",
  long:
    "Source-available under the Functional Source License (FSL-1.1-ALv2). Free to self-host. " +
    "Each release becomes Apache-2.0 two years after it is published.",
} as const;

export const NAV = [
  { href: "/product/", label: "Product" },
  { href: "/use-cases/", label: "Use cases" },
  { href: "/languages/", label: "Languages" },
  { href: "/security/", label: "Security" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/docs/", label: "Docs" },
] as const;
