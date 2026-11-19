/**
 * Fixes from the UX and accessibility review, in the browser: focus returns
 * when a dialog opened without a trigger closes (H5); every Deadlines view
 * opens a deadline's detail (H3); the case page doesn't open covered by the
 * page on a phone (H4); a document can be set aside as not a notice, with
 * Undo (H2); errors sit on their field (M9); Reports says what it needs
 * (M10); Notices keeps the due date on a phone (M11); page titles (L1).
 *
 * Runs on the shared Playwright server. It uploads only fixtures no other
 * spec uses, so their uploads still find their notices new.
 */
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

/** A made-up client address (TEST-NET-2), so sign-ins don't share one rate-limit bucket. */
function testClientAddress(): string {
  const n = () => Math.floor(Math.random() * 250) + 1;
  return `198.51.${n()}.${n()}`;
}

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../../services/engine/tests/fixtures/${name}`, import.meta.url));
const ACCOUNT = { email: "asha@harbour.test", password: "a-long-test-password", name: "Asha Rao" };

async function signIn(page: Page) {
  const base = test.info().project.use.baseURL as string;
  // A client address of its own: every spec signs in from this one machine, and
  // Better Auth allows 20 sign-ins per address in 15 minutes.
  const headers = { origin: base, "x-forwarded-for": testClientAddress() };
  const up = await page.request.post("/api/auth/sign-up/email", { data: ACCOUNT, headers });
  if (up.ok()) return;
  const res = await page.request.post("/api/auth/sign-in/email", { data: ACCOUNT, headers });
  expect(res.status()).toBe(200);
}

/** A case for the ASMT-10 notice: the one another spec opened, or a new one. */
async function caseUrl(page: Page): Promise<string> {
  await page.goto("/notices");
  const grid = page.getByRole("grid", { name: "Notices" });
  await expect(grid).toBeVisible();
  const row = grid.getByRole("row").filter({ hasText: "ZD2910260012345" }).first();
  await row.waitFor({ timeout: 5_000 }).catch(() => {});
  if (!(await row.count())) {
    await page.goto("/inbox");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(fixture("notice-gst-asmt10.pdf"));
    const filing = page.getByRole("list", { name: "To file in a case" });
    const item = filing.getByRole("listitem").filter({ hasText: "ZD2910260012345" });
    await expect(item).toBeVisible({ timeout: 90_000 });
    await item.getByRole("button", { name: "Open case" }).click();
    const dialog = page.getByRole("dialog", { name: "Open a case" });
    await dialog.getByLabel("New client").fill("Harbour Valley Foods Pvt Ltd");
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

test("H5: a dialog opened without a trigger gives focus back to its opener", async ({ page }) => {
  await signIn(page);
  await page.goto(await caseUrl(page));
  // Moving the stage opens a dialog from code (no Radix trigger).
  const stage = page
    .getByRole("navigation", { name: "Case stage" })
    .getByRole("button")
    .filter({ hasText: /Documents gathered|Draft reply/ })
    .first();
  await stage.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(stage).toBeFocused();
});

test("H3: a Deadlines list or timeline row opens the deadline, and focus comes back", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/deadlines");
  await page.getByRole("button", { name: "Add deadline" }).click();
  const add = page.getByRole("dialog", { name: "Add a deadline" });
  // M9: an empty submit marks the field and moves focus to it.
  await add.getByRole("button", { name: "Add deadline" }).click();
  await expect(add.getByText("Give the deadline a title.")).toBeVisible();
  await expect(add.getByLabel("Title")).toBeFocused();
  await add.getByLabel("Title").fill("Reply to the UX review");
  await add.getByRole("button", { name: "Choose date" }).click();
  await page.getByRole("button", { name: /^30 days from today/ }).click();
  await add.getByRole("button", { name: "Add deadline" }).click();
  await expect(add).toBeHidden();

  const title = page.getByRole("link", { name: "Reply to the UX review" }).first();
  await title.focus();
  await page.keyboard.press("Enter");
  const detail = page.getByRole("dialog", { name: "Reply to the UX review" });
  await expect(detail).toBeVisible();
  await expect(detail.getByText("No client yet")).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Why this date" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(title).toBeFocused();

  // The timeline opens the same detail.
  await page.getByRole("radio", { name: "Timeline" }).click();
  await page
    .getByRole("list", { name: "Deadlines timeline" })
    .getByRole("link", { name: "Reply to the UX review" })
    .click();
  await expect(detail).toBeVisible();
  await page.keyboard.press("Escape");

  // A deadline with a page shows it, and opens its case.
  await page.goto("/deadlines?source=notice");
  await page
    .getByRole("link", { name: /explain the discrepancies|personal hearing/i })
    .first()
    .click();
  const proved = page.getByRole("dialog");
  await proved.getByRole("button", { name: "Show on the page" }).click();
  await expect(proved.getByRole("button", { name: "Hide the page" })).toBeVisible();
  await expect(proved.getByRole("button", { name: "Open the case" })).toBeVisible();
});

test("H2: the Inbox sets a document aside as not a notice, with Undo and Put back", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/inbox");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(fixture("invoice-HVC-2026-1183.pdf"));
  const filing = page.getByRole("list", { name: "To file in a case" });
  const item = filing
    .getByRole("listitem")
    .filter({ hasText: /invoice|HVC-2026-1183/i })
    .first();
  await expect(item).toBeVisible({ timeout: 90_000 });
  // M1: the pill says what is wrong, not "Needs review".
  await expect(item.getByText("Needs review")).toHaveCount(0);

  // Today keeps its deadlines apart until it is filed.
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: /Not filed yet/ })).toBeVisible();
  // Today's rows are links.
  await expect(
    page.getByRole("list", { name: "Not filed yet" }).getByRole("link").first(),
  ).toBeVisible();

  await page.goto("/inbox");
  await item.getByRole("button", { name: /^More for / }).click();
  await page.getByRole("menuitem", { name: "Not a notice" }).click();
  await expect(page.getByText("Set aside as not a notice").first()).toBeVisible();
  const aside = page.getByRole("list", { name: "Set aside as not a notice" });
  await expect(aside.getByRole("listitem")).toHaveCount(1);
  await expect(item).toBeHidden();

  await aside.getByRole("button", { name: /^Put back / }).click();
  await expect(aside).toBeHidden();
  await expect(
    filing.getByRole("listitem").filter({ hasText: /invoice|HVC-2026-1183/i }),
  ).toBeVisible();
});

test("H4 @phone: on a phone the case page opens with the page closed", async ({ page }) => {
  await signIn(page);
  const url = await caseUrl(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const inspector = page.getByRole("complementary", { name: "The page" });
  await expect(inspector).toBeHidden();
  await page.getByRole("button", { name: "Show page" }).click();
  await expect(inspector).toBeVisible();

  // M11: Notices keeps the due date on a phone.
  await page.goto("/notices");
  await expect(page.getByRole("columnheader", { name: /Next due/ })).toBeInViewport();
});

test("H4: at 200% zoom (720 × 450) the case page opens with the page closed", async ({ page }) => {
  await signIn(page);
  const url = await caseUrl(page);
  await page.setViewportSize({ width: 720, height: 450 });
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "The page" })).toBeHidden();
});

test("M9 and M10: errors on the field; Reports says what it needs", async ({ page }) => {
  await signIn(page);
  await page.goto("/clients?new=1");
  const dialog = page.getByRole("dialog", { name: "New client" });
  await dialog.getByRole("button", { name: "Add client" }).click();
  await expect(dialog.getByText("Give the client a name.")).toHaveCount(1);
  await expect(dialog.getByLabel("Name", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");

  await page.goto("/reports/evidence");
  await page.waitForURL(/\/reports$/);
  const open = page.getByRole("button", { name: "Open evidence report" });
  await expect(open).toBeEnabled();
  await open.click();
  await expect(
    page.getByRole("alert").filter({ hasText: /Choose a case, a client or a date range/ }),
  ).toBeVisible();
});

test("L1: page titles name the product once", async ({ page }) => {
  await signIn(page);
  await page.goto("/today");
  await expect(page).toHaveTitle("Today · Dueproof");
});
