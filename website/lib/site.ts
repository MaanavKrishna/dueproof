export const REPO = "https://github.com/MaanavKrishna/dueproof";
export const VERSION = "0.1";

/** A file in public/, with the GitHub Pages base path in front. */
export const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;

export const NAV = [
  { href: "/product/", label: "How it works" },
  { href: "/use-cases/", label: "Who it's for" },
  { href: "/languages/", label: "Languages" },
  { href: "/security/", label: "Security" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/docs/", label: "Docs" },
] as const;
