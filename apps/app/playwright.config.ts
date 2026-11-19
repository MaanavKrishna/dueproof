/**
 * Playwright smoke tests (06 §3): the app on PGlite with the fake engine,
 * started fresh in a temporary data folder. Run with `pnpm --filter
 * @dueproof/app e2e`. PLAYWRIGHT_CHROME points at a local Chrome when the
 * bundled browsers aren't installed.
 *
 * It runs a production build (the desktop edition, which allows the fake
 * engine): the dev server's hot reload can reload a page mid-test.
 * E2E_DEV=1 uses `next dev` instead, for quick local iteration;
 * E2E_SKIP_BUILD=1 starts the existing build.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
/** A second app (same build) that reads through the HTTP engine client, and its stub engine. */
const ENGINE_APP_PORT = PORT + 1;
const ENGINE_PORT = PORT + 2;
process.env.E2E_ENGINE_APP_PORT = String(ENGINE_APP_PORT);
process.env.E2E_ENGINE_PORT = String(ENGINE_PORT);
const E2E_ENGINE_SECRET = "e2e-engine-secret-e2e-engine-secret-0123";
process.env.E2E_ENGINE_SECRET = E2E_ENGINE_SECRET;
const E2E_RATE_LIMITS = "auth.ip=2000/15m,signup.ip=2000/1h";
const data = mkdtempSync(join(tmpdir(), "dueproof-e2e-"));
const executablePath = process.env.PLAYWRIGHT_CHROME;
const dev = process.env.E2E_DEV === "1";
/** E2E_SKIP_BUILD=1 starts the last production build as it is (after `pnpm build` with DUEPROOF_EDITION=desktop). */
const skipBuild = process.env.E2E_SKIP_BUILD === "1";

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    timezoneId: "Asia/Kolkata",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: [
    {
      command: dev
        ? `pnpm exec next dev --turbopack -p ${PORT}`
        : skipBuild
          ? `pnpm exec next start -p ${PORT}`
          : `pnpm exec next build --turbopack && pnpm exec next start -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      timeout: 900_000,
      reuseExistingServer: false,
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
        ...(dev ? {} : { DUEPROOF_EDITION: "desktop" }),
        AUTH_SECRET: "e2e-auth-secret-e2e-auth-secret-0123456789",
        APP_URL: `http://localhost:${PORT}`,
        PGLITE_DATA_DIR: join(data, "pglite"),
        STORAGE_LOCAL_DIR: join(data, "files"),
        // Every request here comes from one address; the limits have their own unit tests.
        RATE_LIMITS: E2E_RATE_LIMITS,
      },
    },
    // The same build against the HTTP engine client, for x-journeys-engine.spec.ts:
    // the engine is a stub that spec starts and stops on ENGINE_PORT.
    ...(dev
      ? []
      : [
          {
            command: `pnpm exec next start -p ${ENGINE_APP_PORT}`,
            // Not /api/health: it answers "degraded" while the engine is down.
            url: `http://localhost:${ENGINE_APP_PORT}/manifest.webmanifest`,
            timeout: 900_000,
            reuseExistingServer: false,
            env: {
              NEXT_TELEMETRY_DISABLED: "1",
              DUEPROOF_EDITION: "desktop",
              AUTH_SECRET: "e2e-auth-secret-e2e-auth-secret-0123456789",
              APP_URL: `http://localhost:${ENGINE_APP_PORT}`,
              PGLITE_DATA_DIR: join(data, "pglite-engine"),
              STORAGE_LOCAL_DIR: join(data, "files-engine"),
              ENGINE_MODE: "http",
              ENGINE_URL: `http://127.0.0.1:${ENGINE_PORT}`,
              ENGINE_SHARED_SECRET: E2E_ENGINE_SECRET,
              RATE_LIMITS: E2E_RATE_LIMITS,
            },
          },
        ]),
  ],
});
