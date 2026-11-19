/**
 * Accessibility (06 §3, 07 §7): axe-core on every main screen, in light and
 * dark. Serious and critical violations fail the test; the list names each
 * rule and the first elements it found, so a failure says what to fix. Then
 * the core journey (upload, review, case, mark done) with the keyboard only.
 *
 * Runs on the shared Playwright server, last (files run in name order), so
 * the other specs' uploads still find the notice new. On its own it files
 * the ASMT-10 notice in a case itself.
 */
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

const FIXTURE = fileURLToPath(
  new URL("../../../services/engine/tests/fixtures/notice-gst-asmt10.pdf", import.meta.url),
);
const ACCOUNT = { email: "asha@harbour.test", password: "a-long-test-password", name: "Asha Rao" };

async function signIn(page: Page) {
  const base = test.info().project.use.baseURL as string;
  const headers = { origin: base };
  const up = await page.request.post("/api/auth/sign-up/email", { data: ACCOUNT, headers });
  if (up.ok()) return;
  const res = await page.request.post("/api/auth/sign-in/email", { data: ACCOUNT, headers });
  expect(res.status()).toBe(200);
}

/** Serious and critical violations on the page as it is now, one line each. */
async function violations(page: Page): Promise<string[]> {
  // Let entrance motion finish so colours are measured at rest.
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} — ${v.nodes
          .slice(0, 3)
          .map((n) => `${n.target.join(" ")} ${n.html.slice(0, 160)}`)
          .join(" | ")}`,
    );
}

async function check(page: Page, name: string) {
  const before = await page.evaluate(() => document.documentElement.dataset.theme ?? "");
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    expect.soft(await violations(page), `${name} (${theme})`).toEqual([]);
  }
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, before);
}

/** A case for the ASMT-10 notice: the one another spec opened, or a new one. */
async function caseUrl(page: Page): Promise<string> {
  await page.goto("/notices");
  const grid = page.getByRole("grid", { name: "Notices" });
  await expect(grid).toBeVisible();
  const row = grid.getByRole("row").filter({ hasText: "ZD2910260012345" }).first();
  // The grid renders its rows a moment after the header; give them that moment.
  await row.waitFor({ timeout: 5_000 }).catch(() => {});
  if (!(await row.count())) {
    await page.goto("/inbox");
    await page.locator('input[type="file"]').first().setInputFiles(FIXTURE);
    const filing = page.getByRole("list", { name: "To file in a case" });
    const item = filing.getByRole("listitem").filter({ hasText: "ZD2910260012345" });
    await expect(item).toBeVisible({ timeout: 90_000 });
    await item.getByRole("button", { name: "Open case" }).click();
    const dialog = page.getByRole("dialog", { name: "Open a case" });
    await dialog.getByLabel("New client").fill("Harbour Valley Foods Pvt Ltd");
    await dialog.getByLabel("GSTIN").fill("27AAACH1234F1Z3");
    await dialog.getByRole("button", { name: "Open case" }).click();
    await page.waitForURL(/\/cases\//);
    return page.url();
  }
  await row.getByRole("gridcell").nth(1).click();
  await page.waitForURL(/\/(cases|notices)\/[^/?]+/);
  return page.url();
}

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });

test("sign-in and sign-up have no serious accessibility violations", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await check(page, "sign-in");
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await check(page, "sign-up");
});

test("the main screens have no serious accessibility violations", async ({ page }) => {
  await signIn(page);

  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await check(page, "setup wizard");

  const kase = await caseUrl(page);

  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await check(page, "Today");

  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();
  await check(page, "Inbox");

  await page.goto("/notices");
  await expect(page.getByRole("grid", { name: "Notices" })).toBeVisible();
  await check(page, "Notices");

  await page.goto(kase);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/30 days from receipt/).first()).toBeVisible();
  await check(page, "case page");
  for (const tab of await page.getByRole("tab").all()) {
    const name = (await tab.textContent())?.trim() ?? "tab";
    await tab.click();
    await check(page, `case page, ${name}`);
  }

  await page.goto("/deadlines");
  await expect(page.getByRole("heading", { level: 1, name: "Deadlines" })).toBeVisible();
  await check(page, "Deadlines");
  await page.getByRole("radio", { name: "Calendar" }).click();
  await expect(page.getByRole("grid", { name: /Deadlines calendar/ })).toBeVisible();
  await check(page, "Deadlines calendar");

  await page.goto("/clients");
  await expect(page.getByRole("heading", { level: 1, name: "Clients" })).toBeVisible();
  await check(page, "Clients");
  await page.getByText("Harbour Valley Foods").first().click();
  await page.waitForURL(/\/clients\/[^?]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await check(page, "client page");

  for (const path of [
    "/settings/organisation",
    "/settings/me",
    "/settings/team",
    "/settings/profiles",
    "/settings/ai",
    "/settings/intake",
    "/settings/system",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await check(page, path);
  }

  await page.goto("/reports/evidence?range=2020-01-01..2035-12-31");
  await expect(page.getByRole("heading", { level: 1, name: "Evidence report" })).toBeVisible();
  await check(page, "evidence report");
});

const CIRCULAR = fileURLToPath(
  new URL("../../../services/engine/tests/fixtures/circular-NMR-SAF-2026-041.pdf", import.meta.url),
);

/**
 * Press Tab (or Shift+Tab) until the target has focus. Fails when it never
 * gets there: the target is out of the tab order, or focus is trapped.
 */
async function tabTo(page: Page, target: Locator, { max = 80, back = false } = {}) {
  await expect(target).toBeVisible();
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
  }
  const at = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120));
  throw new Error(`Tab never reached the target; focus is on ${at}`);
}

test("keyboard only: upload, review, open a case, mark a deadline done", async ({ page }) => {
  await signIn(page);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();

  // Upload: the file button opens the chooser from the keyboard.
  await tabTo(page, page.getByRole("button", { name: "Choose files" }).first());
  // Until the page has hydrated the button does nothing; a person is never that quick.
  await expect(async () => {
    const chooser = page.waitForEvent("filechooser", { timeout: 2_000 });
    await page.keyboard.press("Enter");
    await (await chooser).setFiles(CIRCULAR);
  }).toPass({ timeout: 30_000 });

  // File it in a new case (findings wait for review once filed): the dialog takes focus and returns it.
  const filing = page.getByRole("list", { name: "To file in a case" });
  const item = filing
    .getByRole("listitem")
    .filter({ hasText: /Fire safety audit|circular-NMR/ })
    .first();
  await tabTo(page, item.getByRole("button", { name: "Open case" }));
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Open a case" });
  await expect(dialog).toBeVisible();
  await tabTo(page, dialog.getByLabel("New client"));
  await page.keyboard.type("Northline Metro Rail");
  await tabTo(page, dialog.getByRole("button", { name: "Open case" }));
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/cases\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Review its findings: the queue takes focus, J/K move, Enter confirms.
  await page.goto("/inbox");
  // (The recorded engine locates every finding of this circular, so the queue
  // may be empty; when it isn't, an item is confirmed with the keyboard.)
  await expect(page.getByRole("heading", { name: /^Needs review/ })).toBeVisible();
  const queue = page.getByRole("list", { name: "Needs review" });
  if (await queue.count()) {
    const before = await queue.getByRole("listitem").count();
    await tabTo(page, queue.locator('li[tabindex="0"]'));
    await page.keyboard.press("j");
    await page.keyboard.press("k");
    await page.keyboard.press("Enter");
    await expect
      .poll(() => queue.getByRole("listitem").count(), { timeout: 20_000 })
      .toBeLessThan(before);
  }

  // Mark a deadline done on the ASMT-10 case, reached through the Notices grid.
  await caseUrl(page); // setup, not part of the journey: the ASMT-10 case exists
  await page.goto("/notices");
  const grid = page.getByRole("grid", { name: "Notices" });
  await expect(grid).toBeVisible();
  await tabTo(page, grid.locator('[tabindex="0"]').first());
  const rows = grid.getByRole("row");
  const n = await rows.count();
  for (let i = 1; i < n; i++) {
    const rowText = await page.evaluate(
      () => document.activeElement?.closest('[role="row"]')?.textContent ?? "",
    );
    if (rowText.includes("Harbour Valley")) break;
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/cases\//);
  await expect(page.getByText(/30 days from receipt/).first()).toBeVisible();
  // The duty's own menu (the page has one too): open each with Enter, close with Escape.
  const menu = page.getByRole("menu");
  const done = menu.getByRole("menuitem", { name: /Mark done|Reopen/ });
  const menus = page.getByRole("button", { name: "More actions" });
  let found = false;
  for (let m = 0; m < (await menus.count()) && !found; m++) {
    await tabTo(page, menus.nth(m));
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    if (await done.count()) {
      found = true;
      break;
    }
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(menus.nth(m)).toBeFocused();
  }
  expect(found, "a duty with a deadline has Mark done in its menu").toBe(true);
  for (let i = 0; i < 10; i++) {
    if (await done.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("ArrowDown");
  }
  await expect(done).toBeFocused();
  const label = (await done.textContent())?.trim();
  await page.keyboard.press("Enter");
  // The toast, not the screen-reader announcer that repeats its words.
  await expect(
    page.getByText(label === "Reopen" ? "Reopened." : "Marked done.", { exact: true }),
  ).toBeVisible();
  // The menu closed and focus went back to its button, not to the page body.
  await expect(menu).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("BODY");
});
