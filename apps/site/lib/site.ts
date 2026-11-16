export const REPO = "https://github.com/MaanavKrishna/dueproof";

/** What people can run today, and what this site describes. */
export const RELEASED = "0.0.1 demo";
export const BUILDING = "v0.1";

export const LICENCE = {
  name: "FSL-1.1-ALv2",
  short: "Source-available under FSL-1.1-ALv2.",
  long:
    "Source-available under the Functional Source License (FSL-1.1-ALv2). Free to self-host. " +
    "Each release becomes Apache-2.0 two years after it is published.",
} as const;

/** A file in public/, with the GitHub Pages base path in front. */
export const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;

export const NAV = [
  { href: "/product/", label: "Product" },
  { href: "/use-cases/", label: "Use cases" },
  { href: "/languages/", label: "Languages" },
  { href: "/security/", label: "Security" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/docs/", label: "Docs" },
] as const;
