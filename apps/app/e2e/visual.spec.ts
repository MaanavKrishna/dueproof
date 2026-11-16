/**
 * Design screenshots (planning/design/app-*.png). Runs only with
 * SCREENSHOTS_DIR set, after the other specs have filled the workspace (files
 * run in name order):
 *
 *   SCREENSHOTS_DIR=$PWD/../../planning/design pnpm e2e
 *
 * With VISUAL_SWEEP=1 it also saves every screen at 1440 and 390 wide, in
 * light and dark, under SCREENSHOTS_DIR/sweep, to look for layout bugs.
 */
import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

const dir = process.env.SCREENSHOTS_DIR;
const sweep = process.env.VISUAL_SWEEP === "1";
const ACCOUNT = { email: "asha@harbour.test", password: "a-long-test-password", name: "Asha Rao" };

test.skip(!dir, "set SCREENSHOTS_DIR to take screenshots");
test.describe.configure({ mode: "serial", timeout: 600_000 });

async function signIn(page: Page) {
  const base = test.info().project.use.baseURL as string;
  const headers = { origin: base };
  const up = await page.request.post("/api/auth/sign-up/email", { data: ACCOUNT, headers });
  if (up.ok()) return;
  const res = await page.request.post("/api/auth/sign-in/email", { data: ACCOUNT, headers });
  expect(res.status()).toBe(200);
}

async function settle(page: Page) {
  await page
    .getByRole("heading", { level: 1 })
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => {});
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>("main, main *")) {
      if (el.scrollTop > 0 && !el.closest('[aria-label^="Proof viewer"]')) el.scrollTop = 0;
    }
  });
  await page.waitForTimeout(500);
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
}

/** Each screen: where it is, and what to do once there. */
const screens: { name: string; path: string; ready?: (page: Page) => Promise<void> }[] = [
  { name: "today", path: "/today" },
  { name: "inbox", path: "/inbox" },
  { name: "notices", path: "/notices" },
  {
    name: "case",
    path: "/notices",
    ready: async (page) => {
      await page
        .getByRole("grid", { name: "Notices" })
        .getByRole("row")
        .filter({ hasText: "ZD2910260012345" })
        .first()
        .getByRole("gridcell")
        .nth(1)
        .click();
      await page.waitForURL(/\/(cases|notices)\/[^/?]+/);
      const proof = page.getByRole("button", { name: /Page 1/ }).first();
      if (await proof.isVisible()) await proof.click();
    },
  },
  {
    name: "case-exposure",
    path: "/notices",
    ready: async (page) => {
      await page
        .getByRole("grid", { name: "Notices" })
        .getByRole("row")
        .filter({ hasText: "ZD2910260012345" })
        .first()
        .getByRole("gridcell")
        .nth(1)
        .click();
      await page.waitForURL(/\/(cases|notices)\/[^/?]+/);
      await page.getByRole("tab", { name: /Demand and interest/ }).click();
    },
  },
  { name: "deadlines-list", path: "/deadlines" },
  {
    name: "deadlines-calendar",
    path: "/deadlines",
    ready: async (page) => {
      await page.getByRole("radio", { name: "Calendar" }).click();
    },
  },
  { name: "clients", path: "/clients" },
  {
    name: "client-exposure",
    path: "/clients",
    ready: async (page) => {
      await page.getByText("Harbour Valley Foods Pvt Ltd").first().click();
      await page.waitForURL(/\/clients\/[^?]+$/);
      await page.getByRole("tab", { name: /Exposure/ }).click();
    },
  },
  { name: "evidence-report", path: "/reports/evidence?range=2020-01-01..2035-12-31" },
  { name: "settings-ai", path: "/settings/ai" },
  { name: "settings-team", path: "/settings/team" },
  { name: "wizard-step1", path: "/welcome" },
  { name: "capture", path: "/capture" },
];

test("design screenshots at 1440 × 900, 2×", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await settle(page);
  await page.screenshot({ path: `${dir}/app-sign-in.png` });

  await signIn(page);
  for (const s of screens) {
    if (s.name === "capture" || s.name === "case-exposure") continue;
    await page.goto(s.path);
    await s.ready?.(page);
    await settle(page);
    await page.screenshot({ path: `${dir}/app-${s.name}.png` });
  }
  await context.close();
});

test("design screenshots on a phone, 2×", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await signIn(page);
  for (const [name, path] of [
    ["capture-phone", "/capture"],
    ["deadlines-phone", "/deadlines"],
  ] as const) {
    await page.goto(path);
    await settle(page);
    await page.screenshot({ path: `${dir}/app-${name}.png` });
  }
  await context.close();
});

test("layout sweep: 1440 and 390, light and dark", async ({ browser }) => {
  test.skip(!sweep, "set VISUAL_SWEEP=1 for the sweep");
  const out = `${dir}/sweep`;
  mkdirSync(out, { recursive: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width > 600 ? 900 : 844 },
      ...(width < 600 ? { isMobile: true, hasTouch: true } : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await signIn(page);
    for (const s of screens) {
      await page.goto(s.path);
      // A step that has no control at this width (a tab hidden on phones) skips the screen.
      const ready = s.ready
        ? await s.ready(page).then(
            () => true,
            () => false,
          )
        : true;
      if (!ready) continue;
      for (const theme of ["light", "dark"] as const) {
        await setTheme(page, theme);
        await settle(page);
        await page.screenshot({ path: `${out}/${s.name}-${width}-${theme}.png`, fullPage: true });
      }
    }
    await context.close();
  }
});
