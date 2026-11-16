/**
 * Bootstrap the Workflow DevKit Postgres World's schema (its own migrations
 * plus graphile-worker's), under a Postgres advisory lock so two app
 * containers starting together take turns. Idempotent: run on every start
 * by the image's entrypoint.
 *
 * The World's `bootstrap` CLI calls process.exit, so it runs as a child.
 * Connection: WORKFLOW_POSTGRES_URL, else DATABASE_URL. Never printed.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pg = require("pg");

const LOCK = 0x776f_726c_64; // "world"
const url = process.env.WORKFLOW_POSTGRES_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("[workflow] WORKFLOW_POSTGRES_URL or DATABASE_URL is required");
  process.exit(1);
}

async function connect() {
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      return client;
    } catch (e) {
      await client.end().catch(() => {});
      if (attempt >= 60) throw e;
      if (attempt === 1) console.log("[workflow] waiting for the database…");
      await sleep(1000);
    }
  }
}

const client = await connect();
let status = 1;
try {
  await client.query("select pg_advisory_lock($1)", [LOCK]);
  // The package's exports don't list bin/ or package.json: use its folder here.
  const pkgDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "node_modules",
    "@workflow",
    "world-postgres",
  );
  const setup = join(pkgDir, "bin", "setup.js");
  const t0 = Date.now();
  const run = spawnSync(process.execPath, [setup], {
    cwd: pkgDir,
    env: { ...process.env, WORKFLOW_POSTGRES_URL: url },
    encoding: "utf8",
  });
  status = run.status ?? 1;
  if (status === 0) {
    console.log(`[workflow] Postgres World schema ready (${Date.now() - t0} ms)`);
  } else {
    // The CLI prints the connection string redacted; still, show only its last lines.
    const tail = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").slice(-5).join("\n");
    console.error(`[workflow] bootstrap failed (exit ${status})\n${tail}`);
  }
} finally {
  await client.query("select pg_advisory_unlock($1)", [LOCK]).catch(() => {});
  await client.end().catch(() => {});
}
process.exit(status);
