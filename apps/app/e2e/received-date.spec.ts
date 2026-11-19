/**
 * The received date (review findings H1, H2): the Inbox asks for it before
 * an upload (today by default), and each file's date can be changed after
 * it is read. A notice captured without a date shows "Received date
 * assumed: confirm" in the review queue until a person sets the date; its
 * deadlines that run from receipt are then counted again.
 *
 * Shares the organisation with the other specs (sign-up is first-user
 * only), so it files nothing in a case: the smoke spec expects the ASMT-10
 * notice still waiting in the Inbox.
 */
import { expect, type Page, test } from "@playwright/test";

/** A made-up client address (TEST-NET-2), so sign-ins don't share one rate-limit bucket. */
function testClientAddress(): string {
  const n = () => Math.floor(Math.random() * 250) + 1;
  return `198.51.${n()}.${n()}`;
}

const fixture = (name: string) =>
  new URL(`../../../services/engine/tests/fixtures/${name}`, import.meta.url).pathname;
const ASMT10 = fixture("notice-gst-asmt10.pdf");
// A file no earlier spec uploads (layout.spec.ts reads the minutes): this one must be new.
const POSTER = fixture("edge-poster-page.pdf");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Today in India, as an ISO date (the organisation's default time zone). */
function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** 20/11/2026: what a person types in a date field. */
const typed = (iso: string) => iso.split("-").reverse().join("/");
/** 20 Nov 2026 (or 08 Nov 2026): how the app shows a date. */
const shown = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  // Not preceded by a digit: 9 Nov must not match 19 Nov.
  return new RegExp(`(?<!\\d)0?${d} ${MONTHS[(m ?? 1) - 1]} ${y}`);
};

/** Sign up (the first person owns the organisation), or sign in when another spec already did. */
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

test("the received date is asked for at upload and can be changed per file", async ({ page }) => {
  await signIn(page);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();

  const today = todayIst();
  const received = addDays(today, -10);
  // Today is the default, shown before anything is uploaded.
  const bulk = page.getByRole("textbox", { name: "Received on", exact: true });
  await expect(bulk).toHaveValue(shown(today));
  await bulk.fill(typed(received));
  await bulk.press("Enter");
  await expect(bulk).toHaveValue(shown(received));
  await page.locator('input[type="file"]').first().setInputFiles(POSTER);

  // The file carries the date it was sent with, and it can be changed after the read.
  const dates = page.getByRole("list", { name: "Received dates" });
  const field = dates.getByRole("textbox", { name: "Received on, edge-poster-page.pdf" });
  await expect(field).toHaveValue(shown(received));
  const filing = page.getByRole("list", { name: "To file in a case" });
  const item = filing.getByRole("listitem").filter({ hasText: shown(received) });
  await expect(item.first()).toBeVisible({ timeout: 90_000 });
  await expect(item.first()).not.toContainText("assumed");

  const corrected = addDays(today, -12);
  await field.fill(typed(corrected));
  await field.press("Enter");
  await expect(page.getByText("Received date changed").first()).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("list", { name: "To file in a case" })
      .getByRole("listitem")
      .filter({ hasText: shown(corrected) })
      .first(),
  ).toBeVisible();
});

test("a notice captured without a date asks for it, and its deadline is counted again", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/inbox");
  const queue = page.getByRole("list", { name: "Needs review" });
  const card = queue.getByRole("listitem").filter({ hasText: "Received date assumed: confirm" });
  // Captured by the deadlines spec, or here when this spec runs alone.
  if (!(await card.count())) {
    await page.goto("/capture");
    await page.locator("input[type=file]:not([capture])").setInputFiles(ASMT10);
    await expect(page.getByText(/Ready|Done|Already in the register/).first()).toBeVisible({
      timeout: 90_000,
    });
    test.skip(
      await page.getByText("Already in the register").isVisible(),
      "The notice was uploaded with a date by another spec.",
    );
    await page.goto("/inbox");
  }
  await expect(card.first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("list", { name: "To file in a case" })).toContainText(
    "(assumed: confirm)",
  );

  // Set the day it really arrived: the reply's due date is counted from it.
  const real = addDays(todayIst(), -3);
  const date = card.first().getByRole("textbox", { name: /^Received on, / });
  await date.fill(typed(real));
  await date.press("Enter");
  await card.first().getByRole("button", { name: "Set received date" }).click();
  await expect(page.getByText("Received date set").first()).toBeVisible();
  await expect(page.getByText(/due dates? recomputed/).first()).toBeVisible();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("list", { name: "To file in a case" })).not.toContainText(
    "(assumed: confirm)",
  );
});
