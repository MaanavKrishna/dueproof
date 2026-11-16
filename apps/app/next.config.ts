import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  transpilePackages: ["@dueproof/contracts", "@dueproof/core", "@dueproof/db", "@dueproof/tokens", "@dueproof/ui"],
  poweredByHeader: false,
};

export default config;
