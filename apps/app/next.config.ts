import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const appDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(appDir, "..", "..");

// Headers that don't depend on the runtime environment, on every response
// (including build assets, which proxy.ts skips). proxy.ts adds the CSP, HSTS
// and request id at run time.
const staticSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const config: NextConfig = {
  // Self-hosted image: `.next/standalone` holds a minimal server and the
  // traced node_modules; the workspace root is the trace root (monorepo).
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  transpilePackages: [
    "@dueproof/ai",
    "@dueproof/auth",
    "@dueproof/contracts",
    "@dueproof/core",
    "@dueproof/db",
    "@dueproof/engine-client",
    "@dueproof/i18n",
    "@dueproof/icons",
    "@dueproof/storage",
    "@dueproof/tokens",
    "@dueproof/ui",
  ],
  // Native or file-loading modules stay outside the server bundle.
  serverExternalPackages: [
    "@node-rs/argon2",
    "@electric-sql/pglite",
    "postgres",
    "@neondatabase/serverless",
  ],
  poweredByHeader: false,
  // The dev-tools badge styles itself with inline <style>, which our CSP blocks.
  devIndicators: false,
  // The repo has its own AGENTS.md; don't let `next dev` write another one here.
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders }];
  },
};

export default withWorkflow(config);
