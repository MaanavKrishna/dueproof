/**
 * Smoke: sign up, upload the GST ASMT-10 notice and a scanned page, open a
 * case from the Inbox, check the proof on the case page, then find the
 * notice with Search. Runs on the shared Playwright server (fake engine,
 * PGlite); SCREENSHOTS_DIR saves 2× screenshots of each screen.
 */
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../../services/engine/tests/fixtures/${name}`, import.meta.url));
const shots = process.env.SCREENSHOTS_DIR;

async function shot(page: Page, name: string) {
  if (!shots) return;
  // Start each screenshot at the top of the page (not inside the proof viewer).
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>("main, main *")) {
      if (el.scrollTop > 0 && !el.closest('[aria-label^="Proof viewer"]')) el.scrollTop = 0;
    }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/app-${name}.png` });
}

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

/** Sign up (the first person owns the organisation), or sign in when another spec already did. */
async function signIn(page: Page) {
  const base = test.info().project.use.baseURL as string;
  const body = { email: "asha@harbour.test", password: "a-long-test-password", name: "Asha Rao" };
  const headers = { origin: base };
  const up = await page.request.post("/api/auth/sign-up/email", { data: body, headers });
  if (up.ok()) return;
  const res = await page.request.post("/api/auth/sign-in/email", { data: body, headers });
  expect(res.status()).toBe(200);
}

test("Today → Inbox → case page → proof → search", async ({ page }) => {
  await signIn(page);
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();

  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();
  const chooser = page.locator('input[type="file"]').first();
  await chooser.setInputFiles([
    fixture("notice-gst-asmt10.pdf"),
    fixture("Scan-circular-photo.pdf"),
  ]);
  const filing = page.getByRole("list", { name: "To file in a case" });
  // Both are read and wait to be filed in a case (or were already, from another spec).
  await expect(filing.getByText(/ZD2910260012345/)).toBeVisible({ timeout: 90_000 });
  await expect
    .poll(() => filing.getByRole("listitem").count(), { timeout: 90_000 })
    .toBeGreaterThanOrEqual(2);
  await shot(page, "inbox");

  // Open a case for the notice, with a new client.
  await filing
    .getByRole("listitem")
    .filter({ hasText: "ZD2910260012345" })
    .getByRole("button", { name: "Open case" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Open a case" });
  await dialog.getByLabel("New client").fill("Harbour Valley Foods Pvt Ltd");
  await dialog.getByLabel("GSTIN").fill("27AAACH1234F1Z3");
  await dialog.getByRole("button", { name: "Open case" }).click();
  await page.waitForURL(/\/cases\//);

  // The case page: header, the reply duty with its basis, and the page beside it.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/30 days from receipt/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Page 1/ }).first()).toBeVisible();
  await page
    .getByRole("button", { name: /Page 1/ })
    .first()
    .click();
  await expect(page.getByRole("region", { name: /Proof viewer/ }).first()).toBeVisible();
  await shot(page, "case");

  // The demand: confirm the amount stated in the notice.
  await page.getByRole("tab", { name: /Demand and interest/ }).click();
  await page.getByLabel("Tax was due on").fill("20 Oct 2026");
  await page.getByRole("button", { name: /Confirm demand|Save demand/ }).click();
  await expect(page.getByText(/estimate/i).first()).toBeVisible();

  await page.goto("/notices");
  await expect(page.getByRole("grid", { name: "Notices" })).toBeVisible();
  await expect(page.getByText("Harbour Valley Foods Pvt Ltd")).toBeVisible();
  await shot(page, "notices");

  await page.goto("/today");
  await expect(page.getByText(/due this week|hearing|overdue/i).first()).toBeVisible();
  await shot(page, "today");

  await page.goto("/search?q=discrepancies");
  const results = page.getByRole("list", { name: "Results" });
  await expect(results.getByRole("link").first()).toBeVisible();
  await results.getByRole("link").first().click();
  await page.waitForURL(/\/cases\//);
  await expect(page.getByText(/30 days from receipt/).first()).toBeVisible();
});
