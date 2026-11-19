/**
 * Journeys: clients and deadlines. A client by hand, a CSV import with good
 * and bad rows, merging the duplicate it makes, the client page; then a
 * deadline added by hand, snoozed, reassigned, marked done and reopened, the
 * calendar and timeline views, the iCal feed link and the CSV export.
 */
import { expect, type Page, test } from "@playwright/test";
import { RUN, signInOwner, watchConsole } from "./journeys-helpers";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

const kept = `Coastal Spices ${RUN}`;
const imported = `Coastal Spices Pvt Ltd ${RUN}`;
const pan = `AAACC${String(Date.now() % 10_000).padStart(4, "0")}C`;
const dutyTitle = `Hearing before the Deputy Commissioner ${RUN}`;

async function rowActions(page: Page, title: string) {
  // Let the last change's refresh land first: it re-renders the rows.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: `Actions for ${title}` }).click();
}

test("a client by hand, then a CSV import with a bad row", async ({ page }) => {
  const problems = watchConsole(page);
  await signInOwner(page);
  await page.goto("/clients?new=1");
  await page.getByLabel("Name", { exact: true }).fill(kept);
  await page.getByLabel("PAN").fill(pan);
  await page.getByRole("button", { name: "Add client" }).click();
  await expect(page).toHaveURL(/\/clients\/[^?]+$/);
  await expect(page.getByRole("heading", { level: 1, name: kept })).toBeVisible();

  await page.goto("/clients");
  // "1 client", never "1 clients".
  await expect(page.getByText(/\b\d[\d,]* clients? ·/)).toBeVisible();
  await expect(page.getByText(/(^|\D)1 clients/)).toHaveCount(0);

  await page.getByRole("button", { name: "Import" }).click();
  const dialog = page.getByRole("dialog", { name: "Import clients" });
  await dialog
    .getByLabel("Or paste rows (with a header row)")
    .fill(
      [
        "Name,PAN,GSTIN",
        `Harbour Freight ${RUN},,`,
        `${imported},${pan},`,
        `Broken GSTIN Traders ${RUN},,27AAACB1234A1ZZ`,
      ].join("\n"),
    );
  await expect(dialog.getByText("2 rows ready · 1 with problems")).toBeVisible();
  await expect(dialog.getByText(/GSTIN/).nth(1)).toBeVisible();
  await dialog.getByRole("button", { name: "Import 2 clients" }).click();
  await expect(dialog.getByText("Imported")).toBeVisible();
  await page.keyboard.press("Escape");
  // The row with a known PAN matched the existing client rather than adding one.
  await page.goto("/clients");
  await expect(
    page.getByRole("gridcell", { name: `Harbour Freight ${RUN}` }).first(),
  ).toBeVisible();
  await expect(page.getByRole("gridcell", { name: imported, exact: true })).toHaveCount(0);
  expect(problems()).toEqual([]);
});

test("a duplicate added by hand is offered for merging", async ({ page }) => {
  await signInOwner(page);
  await page.goto("/clients?new=1");
  await page.getByLabel("Name", { exact: true }).fill(imported);
  await page.getByLabel("PAN").fill(pan);
  await page.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByRole("heading", { level: 1, name: imported })).toBeVisible();
  await page.goto("/clients");
  await expect(page.getByText(/possible duplicate/).first()).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`share PAN ${pan}`) }).click();
  const dialog = page.getByRole("dialog", { name: "Merge duplicate clients" });
  await dialog.getByRole("radio", { name: kept }).check();
  await dialog.getByRole("button", { name: "Merge" }).click();
  await expect(dialog).toBeHidden();
  await page.goto("/clients");
  await expect(page.getByRole("gridcell", { name: kept, exact: true }).first()).toBeVisible();
  await expect(page.getByRole("gridcell", { name: imported, exact: true })).toHaveCount(0);
});

test("a deadline by hand: snooze, reassign, done and reopen", async ({ page }) => {
  const problems = watchConsole(page);
  await signInOwner(page);
  await page.goto("/deadlines");
  await page.getByRole("button", { name: "Add deadline" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a deadline" });
  await dialog.getByLabel("Title").fill(dutyTitle);
  await dialog.getByLabel("Due on").fill("15 Dec 2026");
  await dialog.getByLabel("Due on").press("Tab");
  await dialog.getByLabel("Why this date").fill("Date set by the officer on the phone.");
  await dialog.getByRole("button", { name: "Add deadline" }).click();
  await expect(page.getByText("Deadline added").first()).toBeVisible();
  await expect(page.getByText(dutyTitle).first()).toBeVisible();

  await rowActions(page, dutyTitle);
  await page.getByRole("menuitem", { name: "Assign to" }).hover();
  await page.getByRole("menuitem", { name: /Asha Rao/ }).click();
  await expect(page.getByText(/Asha Rao/).first()).toBeVisible();

  await rowActions(page, dutyTitle);
  await page.getByRole("menuitem", { name: "Mark done" }).click();
  await expect(page.getByText(`Marked done: ${dutyTitle}`).first()).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).first().click();
  await expect(page.getByRole("button", { name: `Actions for ${dutyTitle}` })).toBeVisible();

  // Snoozed last: a snoozed deadline moves out of the open list.
  // (Right after an undo the rows re-render and can close an open menu: try again.)
  await expect(async () => {
    await page.keyboard.press("Escape");
    await rowActions(page, dutyTitle);
    await page.getByRole("menuitem", { name: "Snooze" }).hover({ timeout: 3_000 });
    await page.getByRole("menuitem", { name: "For 3 days" }).click({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByText(/Snoozed/).first()).toBeVisible();
  expect(problems()).toEqual([]);
});

test("calendar, timeline, the iCal feed and the CSV export", async ({ page }) => {
  await signInOwner(page);
  await page.goto("/deadlines");
  await page.getByRole("radio", { name: "Calendar" }).click();
  await expect(page.getByRole("grid", { name: /Deadlines calendar/ })).toBeVisible();
  await page.getByRole("radio", { name: "Timeline" }).click();
  // Snoozed deadlines stay out of the timeline, as out of the list.
  await expect(
    page.getByLabel("Deadlines timeline").or(page.getByRole("heading", { name: "Nothing due" })),
  ).toBeVisible();
  await page.getByRole("radio", { name: "List" }).click();

  await page.getByRole("button", { name: "Subscribe (iCal)" }).click();
  await page.getByRole("menuitem").first().click();
  const feed = page.getByRole("dialog", { name: "Calendar feed" });
  const url = await feed.getByLabel("Feed link").inputValue();
  expect(url).toMatch(/\/api\/v1\/calendar\//);
  const ics = await page.request.get(new URL(url).pathname);
  expect(ics.status()).toBe(200);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  expect(await ics.text()).toContain("BEGIN:VCALENDAR");
  await page.keyboard.press("Escape");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const csv = await (await download).path();
  expect(csv).toBeTruthy();
});

test("the client page and its tabs", async ({ page }) => {
  await signInOwner(page);
  await page.goto("/clients");
  await page.getByRole("gridcell", { name: kept, exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: kept })).toBeVisible();
  for (const tab of await page.getByRole("tab").all()) {
    await tab.click();
    await expect(page.getByRole("tabpanel").first()).toBeVisible();
  }
  // Registrations giving statutory deadlines: deadlines-clients-reports.spec.ts.
});
