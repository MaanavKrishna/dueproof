import type { NextConfig } from "next";

// The site is served from the root on Vercel. PAGES_BASE_PATH is only for
// hosting the static export under a sub-path; leave it unset.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
  // The Ledger packages ship TypeScript and CSS Modules, not built files.
  transpilePackages: ["@dueproof/ui", "@dueproof/tokens", "@dueproof/icons"],
  poweredByHeader: false,
};

export default config;
