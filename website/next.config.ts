import type { NextConfig } from "next";

// GitHub Pages serves a project site under /<repo>/; set PAGES_BASE_PATH=/dueproof
// there. Locally and on a custom domain it stays empty.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
};

export default config;
