#!/usr/bin/env node
// Local-mode spike: assemble the sidecar runtime and measure it.
//
//   pnpm --filter @dueproof/app build          # .next/standalone
//   node apps/desktop/scripts/local-spike.mjs [--engine-python /path/to/venv/bin/python]
//
// It lays out apps/desktop/local-runtime/ the way src-tauri/src/local.rs
// expects (node/, app/, engine/), then starts the app server (and the engine,
// when a Python with services/engine's dependencies is given) on 127.0.0.1
// with random ports and a per-launch secret, exactly as the shell would, and
// reports sizes and cold-start times. Data goes to a temporary folder that is
// removed afterwards. Nothing here is shipped.

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { createServer } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const appDir = join(repo, "apps/app");
const engineDir = join(repo, "services/engine");
const rt = join(repo, "apps/desktop/local-runtime");

const args = process.argv.slice(2);
const enginePython = args.includes("--engine-python")
  ? args[args.indexOf("--engine-python") + 1]
  : null;

const du = (p) => Number(execFileSync("du", ["-sbL", p]).toString().split("\t")[0]);
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const gzSize = (p) =>
  Number(
    execFileSync("sh", [
      "-c",
      `tar -C "${dirname(p)}" -chf - "${p.split("/").pop()}" | gzip -6 | wc -c`,
    ])
      .toString()
      .trim(),
  );

function freePort() {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
}

// The same clean environment the shell gives its children (local.rs base_env).
function baseEnv() {
  const keep = ["PATH", "HOME", "USERPROFILE", "SystemRoot", "TEMP", "TMP", "TMPDIR", "LANG"];
  return Object.fromEntries(keep.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
}

async function waitFor(url, ms) {
  const start = performance.now();
  while (performance.now() - start < ms) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return performance.now() - start;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`no answer from ${url} within ${ms} ms`);
}

// 1. Assemble the runtime.
const standalone = join(appDir, ".next/standalone");
if (!existsSync(join(standalone, "apps/app/server.js"))) {
  console.error("Build the app first: pnpm --filter @dueproof/app build");
  process.exit(1);
}
rmSync(rt, { recursive: true, force: true });
mkdirSync(join(rt, "node/bin"), { recursive: true });
symlinkSync(process.execPath, join(rt, "node/bin/node"));
cpSync(standalone, join(rt, "app"), { recursive: true, verbatimSymlinks: true });
cpSync(join(appDir, ".next/static"), join(rt, "app/apps/app/.next/static"), { recursive: true });
cpSync(join(appDir, "public"), join(rt, "app/apps/app/public"), { recursive: true });
if (enginePython) {
  mkdirSync(join(rt, "engine"), { recursive: true });
  cpSync(join(engineDir, "dueproof_engine"), join(rt, "engine/dueproof_engine"), {
    recursive: true,
  });
}

const sizes = {
  node: du(process.execPath),
  app: du(join(rt, "app")),
  appGz: gzSize(join(rt, "app")),
};
if (enginePython) {
  const venv = resolve(dirname(enginePython), "..");
  sizes.engineVenv = du(venv);
  sizes.engineCode = du(join(rt, "engine/dueproof_engine"));
}

// 2. Start the sidecars twice: first launch (empty data, migrations) and a warm restart.
const data = mkdtempSync(join(tmpdir(), "dueproof-local-"));
const authSecret = randomBytes(32).toString("hex");
const runs = [];
for (const label of ["first launch", "second launch"]) {
  const launchSecret = randomBytes(32).toString("hex");
  const children = [];
  const run = { label };
  try {
    let enginePort = null;
    if (enginePython) {
      enginePort = await freePort();
      const t0 = performance.now();
      children.push(
        spawn(
          enginePython,
          [
            "-m",
            "uvicorn",
            "dueproof_engine.app:app",
            "--host",
            "127.0.0.1",
            "--port",
            String(enginePort),
            "--workers",
            "1",
            "--no-server-header",
          ],
          {
            cwd: join(rt, "engine"),
            env: { ...baseEnv(), ENGINE_SHARED_SECRET: launchSecret },
            stdio: "ignore",
          },
        ),
      );
      await waitFor(`http://127.0.0.1:${enginePort}/health`, 60_000);
      run.engineMs = Math.round(performance.now() - t0);
    }
    const port = await freePort();
    const env = {
      ...baseEnv(),
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      DUEPROOF_EDITION: "desktop",
      APP_URL: `http://127.0.0.1:${port}`,
      AUTH_SECRET: authSecret,
      AUTH_SIGNUP: "first-user",
      PGLITE_DATA_DIR: join(data, "pglite"),
      DB_MIGRATE_ON_START: "1",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: join(data, "files"),
      DUEPROOF_LAUNCH_SECRET: launchSecret,
      ...(enginePort
        ? {
            ENGINE_MODE: "http",
            ENGINE_URL: `http://127.0.0.1:${enginePort}`,
            ENGINE_SHARED_SECRET: launchSecret,
          }
        : {}),
    };
    const t0 = performance.now();
    const app = spawn(join(rt, "node/bin/node"), ["server.js"], {
      cwd: join(rt, "app/apps/app"),
      env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    children.push(app);
    let stderr = "";
    app.stderr.on("data", (d) => {
      stderr += d;
    });
    run.listenMs = Math.round(await waitFor(`http://127.0.0.1:${port}/api/health`, 90_000));
    const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
    run.health = health.status;
    run.engine = health.checks?.engine?.ok ? "ok" : "not answering";
    const t1 = performance.now();
    const page = await fetch(`http://127.0.0.1:${port}/sign-up`);
    run.firstPageMs = Math.round(performance.now() - t1);
    run.firstPageStatus = page.status;
    run.totalMs = Math.round(performance.now() - t0) + (run.engineMs ?? 0);
    // Loopback only: the app must not answer on this computer's network address.
    const lan = Object.values(networkInterfaces())
      .flat()
      .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
    if (lan) {
      run.answersOnNetwork = await fetch(`http://${lan}:${port}/api/health`, {
        signal: AbortSignal.timeout(2000),
      }).then(
        () => true,
        () => false,
      );
    }
    if (stderr.trim()) run.stderr = stderr.trim().split("\n").slice(-3).join(" | ");
  } finally {
    for (const c of children) c.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
  }
  runs.push(run);
}
rmSync(data, { recursive: true, force: true });

console.log("\nLocal-mode spike");
console.log(`  node runtime        ${mb(sizes.node)}`);
console.log(`  app (standalone)    ${mb(sizes.app)} on disk, ${mb(sizes.appGz)} gzipped`);
if (sizes.engineVenv) {
  console.log(`  engine venv         ${mb(sizes.engineVenv)} (no torch, no Tesseract)`);
  console.log(`  engine code         ${mb(sizes.engineCode)}`);
}
for (const r of runs) console.log(`  ${r.label.padEnd(20)}${JSON.stringify(r)}`);
console.log(`\nruntime left in ${rt} (git-ignored); data folder removed.`);
