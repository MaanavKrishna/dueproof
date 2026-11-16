/**
 * Smoke: sign up, upload the GST ASMT-10 notice and a scanned page, open a
 * case from the Inbox, check the proof on the case page, then find the
 * notice with Search. Needs open sign-up (AUTH_SIGNUP=open) and the fake
 * engine (no ENGINE_URL).
 */
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../../services/engine/tests/fixtures/${name}`, import.meta.url));
const shots = process.env.SCREENSHOTS_DIR;

async function shot(page: Page, name: string) {
  if (!shots) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/app-${name}.png` });
}

test("Today → Inbox → case page → proof → search", async ({ page, request, baseURL }) => {
  const email = `smoke-${Date.now()}@firm.test`;
  const res = await request.post("/api/auth/sign-up/email", {
    data: { email, password: "a-long-test-password", name: "Priya Sharma" },
    headers: { origin: baseURL ?? "" },
  });
  expect(res.ok()).toBe(true);
  // The request context's cookies are shared with the page.
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);

  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.getByText("Nothing is due yet")).toBeVisible();

  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();
  const chooser = page.locator('input[type="file"]').first();
  await chooser.setInputFiles([
    fixture("notice-gst-asmt10.pdf"),
    fixture("Scan-circular-photo.pdf"),
  ]);
  const filing = page.getByRole("list", { name: "To file in a case" });
  await expect(filing.getByText(/ASMT-10/)).toBeVisible({ timeout: 60_000 });
  // The scan has no duty on it: it waits in the review queue.
  await expect(page.getByText("No deadline found on this document")).toBeVisible({
    timeout: 60_000,
  });
  await shot(page, "inbox");

  // Open a case for the notice, with a new client.
  await filing
    .getByRole("listitem")
    .filter({ hasText: "ASMT-10" })
    .getByRole("button", { name: "Open case" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Open a case" });
  await dialog.getByLabel("New client").fill("Harbour Valley Foods Pvt Ltd");
  await dialog.getByLabel("GSTIN").fill("27AAACH1234F1Z5");
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
  await page.waitForURL(/\/cases\/.+\?/);
  await expect(page.getByText(/30 days from receipt/).first()).toBeVisible();
});
