/**
 * Smoke: sign up, add a client with GST (monthly) and TDS registrations and
 * see its statutory deadlines in Deadlines and the calendar; capture the
 * ASMT-10 notice and see its deadline; open the evidence report; on a phone,
 * the capture page opens the camera and the app is installable.
 */
import { expect, type Page, test } from "@playwright/test";

/** A made-up client address (TEST-NET-2), so sign-ins don't share one rate-limit bucket. */
function testClientAddress(): string {
  const n = () => Math.floor(Math.random() * 250) + 1;
  return `198.51.${n()}.${n()}`;
}

const FIXTURE = new URL(
  "../../../services/engine/tests/fixtures/notice-gst-asmt10.pdf",
  import.meta.url,
).pathname;
const CODES = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function gstin(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CODES.indexOf(first14[i] ?? "") * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return `${first14}${CODES[(36 - (sum % 36)) % 36]}`;
}

/** Sign up (the first person owns a new organisation), or sign in on later runs. */
async function signIn(page: Page) {
  const base = test.info().project.use.baseURL as string;
  const body = { email: "asha@harbour.test", password: "a-long-test-password", name: "Asha Rao" };
  // A client address of its own: every spec signs in from this one machine, and
  // Better Auth allows 20 sign-ins per address in 15 minutes.
  const headers = { origin: base, "x-forwarded-for": testClientAddress() };
  const up = await page.request.post("/api/auth/sign-up/email", { data: body, headers });
  if (up.ok()) return;
  const res = await page.request.post("/api/auth/sign-in/email", { data: body, headers });
  expect(res.status()).toBe(200);
}

test.describe.configure({ mode: "serial" });

test("client registrations build the statutory calendar", async ({ page }) => {
  await signIn(page);
  await page.goto("/clients?new=1");
  await page.getByLabel("Name", { exact: true }).fill("Harbour Valley Foods");
  await page.getByLabel("GSTINs").fill(gstin("27AAACH1234A1Z"));
  await page.getByLabel("TAN").fill("MUMH12345B");
  await page.getByRole("button", { name: "Add client" }).click();
  await page.waitForURL(/\/clients\/[^?]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Harbour Valley Foods" })).toBeVisible();

  await page.getByRole("tab", { name: /Registrations/ }).click();
  await page.getByRole("button", { name: "Add registration" }).click();
  await page.getByRole("button", { name: "Save and rebuild calendar" }).click();
  await expect(page.getByText(/Calendar rebuilt/).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add registration" }).click();
  await page.getByRole("combobox", { name: "Kind" }).click();
  await page.getByRole("option", { name: "TDS (TAN)" }).click();
  await page.getByRole("button", { name: "Save and rebuild calendar" }).click();
  await expect(page.getByText("TDS (TAN) · MUMH12345B")).toBeVisible({ timeout: 20_000 });

  await page.goto("/deadlines");
  await expect(page.getByRole("heading", { level: 1, name: "Deadlines" })).toBeVisible();
  await expect(page.getByText(/GSTR-3B/).first()).toBeVisible();
  await expect(page.getByText(/26Q/).first()).toBeVisible();
  await page.getByRole("radio", { name: "Calendar" }).click();
  await expect(page.getByRole("grid", { name: /Deadlines calendar/ })).toBeVisible();
});

test("a captured notice adds its deadline, and the evidence report prints", async ({ page }) => {
  await signIn(page);
  await page.goto("/capture");
  await page.locator("input[type=file]:not([capture])").setInputFiles(FIXTURE);
  await expect(page.getByText(/Ready|Done/).first()).toBeVisible({ timeout: 60_000 });

  await page.goto("/deadlines?source=notice");
  await expect(page.getByText("Notice", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  await page.goto("/reports/evidence?range=2020-01-01..2035-12-31");
  await expect(page.getByRole("heading", { level: 1, name: "Evidence report" })).toBeVisible();
  await expect(page.getByText(/Exact match on the page/).first()).toBeVisible();
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ format: "A4" });
  expect(pdf.byteLength).toBeGreaterThan(5_000);
});

test("@phone capture opens the camera and the app is installable", async ({ page }) => {
  await signIn(page);
  await page.goto("/capture");
  await expect(page.locator('input[type=file][capture="environment"]')).toHaveAttribute(
    "accept",
    "image/*,application/pdf",
  );
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    display: "standalone",
    start_url: expect.stringContaining("/today"),
  });
  const sw = await page.request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(await sw.text()).toContain("Pages are never cached");
});
