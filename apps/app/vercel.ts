/**
 * Vercel project configuration for the hosted app (the "dueproof-app"
 * project, Root Directory apps/app). Compiled to vercel.json by the Vercel
 * CLI at build time. Environment variables and the step-by-step setup are in
 * infra/vercel/README.md; the security headers come from proxy.ts.
 */
import type { VercelConfig } from "@vercel/config/v1";

const config: VercelConfig = {
  framework: "nextjs",
  // pnpm finds the workspace root (pnpm-workspace.yaml) from apps/app.
  installCommand: "pnpm install --frozen-lockfile",
  buildCommand: "pnpm run build",
  // Functions next to the database (Neon aws-ap-south-1) and the data: Mumbai (03 §9).
  regions: ["bom1"],
  fluid: true,
  functions: {
    // Workflow DevKit routes: steps call engine-fast and start engine-heavy
    // Sandboxes, so they get the plan's maximum (the Workflow builder asks for
    // the same in its own function config).
    "app/.well-known/workflow/**/*": { maxDuration: "max" },
    // Live status stream (SSE) for a document being processed.
    "app/api/v1/documents/[id]/events/route.ts": { maxDuration: 300 },
    // Completing an upload hashes the stored file and starts the workflow.
    "app/api/v1/uploads/**/*": { maxDuration: 60 },
    // Morning digest, notifications and escalation for every organisation.
    "app/api/cron/daily/route.ts": { maxDuration: 300 },
  },
  // 06:45 IST (01:15 UTC): before the working day. Vercel sends CRON_SECRET as a bearer token.
  crons: [{ path: "/api/cron/daily", schedule: "15 1 * * *" }],
};
export default config;
