/**
 * Journey: the reading engine is down, then comes back. Runs on the second
 * Playwright server (playwright.config.ts), which reads through the real HTTP
 * engine client with its signed tokens, as self-hosted and hosted installs
 * do, instead of the in-process fake. The engine here is the fake behind
 * that HTTP API, started and stopped by this spec.
 */
import { createServer, type Server } from "node:http";
import { createFakeEngine, createFakeEngineHandler } from "@dueproof/engine-client";
import { expect, test } from "@playwright/test";
import { fixture, OWNER, watchConsole } from "./journeys-helpers";

const APP_PORT = Number(process.env.E2E_ENGINE_APP_PORT);
const ENGINE_PORT = Number(process.env.E2E_ENGINE_PORT);
const SECRET = process.env.E2E_ENGINE_SECRET as string;
const APP = `http://localhost:${APP_PORT}`;

test.skip(!APP_PORT || process.env.E2E_DEV === "1", "needs the second (HTTP engine) server");
test.describe.configure({ mode: "serial" });
test.use({ baseURL: APP, viewport: { width: 1440, height: 900 } });

let engine: Server | undefined;

function startEngine(): Promise<void> {
  const fake = createFakeEngine({
    fetchSource: async (url) => {
      const r = await fetch(url);
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    },
    putObject: (url, body, contentType) =>
      fetch(url, {
        method: "PUT",
        headers: { "content-type": contentType },
        body: body as BodyInit,
      }),
  });
  const handle = createFakeEngineHandler(fake, SECRET);
  engine = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", rungs: { text_layer: true }, translation: "none" }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const r = await handle(
      new Request(`http://127.0.0.1:${ENGINE_PORT}${req.url}`, {
        method: req.method ?? "POST",
        headers: req.headers as Record<string, string>,
        ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
      }),
    );
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  return new Promise((resolve) => engine?.listen(ENGINE_PORT, "127.0.0.1", () => resolve()));
}

test.afterAll(async () => {
  await new Promise((resolve) => (engine ? engine.close(resolve) : resolve(undefined)));
});

test("a notice read while the engine is down fails plainly, and Retry reads it once it's back", async ({
  page,
}) => {
  const problems = watchConsole(page);
  const headers = { origin: APP };
  const signedIn = await page.request.post("/api/auth/sign-in/email", {
    data: { email: OWNER.email, password: OWNER.password },
    headers,
  });
  if (!signedIn.ok()) {
    expect(
      (await page.request.post("/api/auth/sign-up/email", { data: OWNER, headers })).ok(),
    ).toBe(true);
  }

  await page.goto("/settings/system");
  await expect(page.getByText("Running with problems")).toBeVisible();
  await expect(page.getByText(/Not answering/)).toBeVisible();

  await page.goto("/inbox");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').first().setInputFiles(fixture("minutes-board-87.pdf"));
  const item = page.locator("li").filter({ hasText: "minutes-board-87.pdf" }).first();
  await expect(item.getByText("Failed")).toBeVisible({ timeout: 60_000 });
  await expect(item.getByText(/couldn't be read\. Retry/)).toBeVisible();

  await startEngine();
  await item.getByRole("button", { name: "Retry minutes-board-87.pdf" }).click();
  await expect(item.getByText(/Needs review|Ready/)).toBeVisible({ timeout: 60_000 });
  const filing = page.getByRole("list", { name: "To file in a case" });
  await expect(filing.getByText(/Minutes of the 87th meeting/)).toBeVisible();

  await page.goto("/settings/system");
  await expect(page.getByText("All systems working")).toBeVisible();
  expect(problems()).toEqual([]);
});
