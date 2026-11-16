import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // The Ledger packages ship TypeScript and CSS Modules, not built files.
  transpilePackages: ["@dueproof/ui", "@dueproof/tokens", "@dueproof/icons"],
  poweredByHeader: false,
};

export default config;
