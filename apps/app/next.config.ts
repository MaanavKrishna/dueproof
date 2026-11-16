import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const config: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@dueproof/auth",
    "@dueproof/contracts",
    "@dueproof/core",
    "@dueproof/db",
    "@dueproof/engine-client",
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
};

export default withWorkflow(config);
