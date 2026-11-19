/**
 * Journeys: notices. Uploading a folder, several files, a photo, a locked
 * PDF (the unlock step), a duplicate and a file of the wrong type; what the
 * tray's "Open" does for each; filing a notice in a case; the case page and
 * its tabs; the proof viewer; marking a duty done and reopening it; and a
 * comment that mentions a colleague, who sees it under the bell.
 *
 * Leaves the GST ASMT-10 notice alone: smoke.spec.ts and wcag.spec.ts file it.
 */
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  fixture,
  invite,
  join,
  ownAddressPerTest,
  RUN,
  signInOwner,
  watchConsole,
} from "./journeys-helpers";

test.describe.configure({ mode: "serial" });
ownAddressPerTest();
test.use({ viewport: { width: 1440, height: 900 } });

const colleague = { email: `ravi-${RUN}@harbour.test`, name: `Ravi ${RUN}` };
const clientName = `Northline Metro Rail ${RUN}`;
let caseUrl = "";

/** A row of the upload tray, by file name. */
function trayItem(page: Page, name: string) {
  return page
    .locator("li")
    .filter({ hasText: name })
    .filter({ has: page.getByText(/KB|MB|B$/) })
    .first();
}

/** Read now, or recognised as one another spec already uploaded (they share the server). */
const READ = /Read: something to check|Ready|Already in the register/;

test("upload a folder, several files and a photo; each is read", async ({ page }) => {
  const problems = watchConsole(page);
  await signInOwner(page);
  await page.goto("/inbox");
  await page.waitForLoadState("networkidle"); // hydrated: the file inputs listen
  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();

  // A folder (the "Choose folder" input takes a directory).
  const dir = mkdtempSync(joinPath(tmpdir(), "dueproof-folder-"));
  mkdirSync(joinPath(dir, "October"));
  copyFileSync(fixture("circular-NMR-SAF-2026-041.pdf"), joinPath(dir, "October", "circular.pdf"));
  copyFileSync(fixture("minutes-board-87.pdf"), joinPath(dir, "October", "minutes.pdf"));
  const folder = page.locator('input[type="file"][webkitdirectory]');
  await folder.setInputFiles(joinPath(dir, "October"));
  await expect(trayItem(page, "circular.pdf").getByText(READ)).toBeVisible({
    timeout: 60_000,
  });
  await expect(trayItem(page, "minutes.pdf").getByText(READ)).toBeVisible({
    timeout: 60_000,
  });

  // Several at once.
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([fixture("invoice-HVC-2026-1183.pdf"), fixture("edge-poster-page.pdf")]);
  await expect(trayItem(page, "invoice-HVC-2026-1183.pdf").getByText(READ)).toBeVisible({
    timeout: 60_000,
  });
  await expect(trayItem(page, "edge-poster-page.pdf").getByText(READ)).toBeVisible({
    timeout: 60_000,
  });

  // A photo from the phone: a PNG with nothing on it to read.
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 400, height: 300 } });
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: `photo-${RUN}.png`, mimeType: "image/png", buffer: png });
  await expect(
    trayItem(page, `photo-${RUN}.png`).getByText(/Read: something to check|Ready/),
  ).toBeVisible({
    timeout: 60_000,
  });

  // Everything read waits to be filed in a case.
  const filing = page.getByRole("list", { name: "To file in a case" });
  await expect(filing.getByText(/Fire safety audit/).first()).toBeVisible();
  await expect(filing.getByText(/TAX INVOICE/).first()).toBeVisible();
  expect(problems()).toEqual([]);
});

test("a locked PDF waits for its password, then is read", async ({ page }) => {
  await signInOwner(page);
  await page.goto("/inbox");
  await page.waitForLoadState("networkidle"); // hydrated: the file inputs listen
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(fixture("edge-password-protected.pdf"));
  const item = trayItem(page, "edge-password-protected.pdf");
  // Either needs a password now, or another run already unlocked it.
  await expect(item.getByText(/This PDF needs a password|Already in the register/)).toBeVisible({
    timeout: 60_000,
  });
  if (await item.getByText("Already in the register").count()) return;
  // Says what to do, not the same words twice.
  await expect(item.getByText("This PDF needs a password")).toHaveCount(1);
  await expect(item.getByText("Enter its password to read it.")).toBeVisible();
  await item.getByRole("button", { name: "Enter password" }).click();
  const dialog = page.getByRole("dialog", { name: "This PDF needs a password" });
  await dialog.getByLabel("Password").fill("open-sesame");
  await dialog.getByRole("button", { name: "Read it" }).click();
  await expect(dialog).toBeHidden();
  await expect(item.getByText(/Read: something to check|Ready/)).toBeVisible({ timeout: 60_000 });
});

test("a duplicate and a file of the wrong type are turned away, and say why", async ({ page }) => {
  await signInOwner(page);
  await page.goto("/inbox");
  await page.waitForLoadState("networkidle"); // hydrated: the file inputs listen
  const dir = mkdtempSync(joinPath(tmpdir(), "dueproof-txt-"));
  writeFileSync(joinPath(dir, "notes.txt"), "Reply by Friday.");
  await page.locator('input[type="file"]').first().setInputFiles(joinPath(dir, "notes.txt"));
  await expect(page.getByText("1 file not added").first()).toBeVisible();
  await expect(
    page.getByText(/notes\.txt: This type of file isn't supported/).first(),
  ).toBeVisible();

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(fixture("invoice-HVC-2026-1183.pdf"));
  const dup = trayItem(page, "invoice-HVC-2026-1183.pdf");
  await expect(dup.getByText("Already in the register")).toHaveCount(1);
  // "Open" on a duplicate that isn't in a case yet offers to file it.
  await dup.getByRole("button", { name: "Open" }).click();
  const dialog = page.getByRole("dialog", { name: "Open a case" });
  await expect(dialog.getByText(/TAX INVOICE/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("file a notice in a case with a new client, and read the case page", async ({ page }) => {
  const problems = watchConsole(page);
  await signInOwner(page);
  await page.goto("/inbox");
  await page.waitForLoadState("networkidle"); // hydrated: the file inputs listen
  const item = page
    .getByRole("list", { name: "To file in a case" })
    .getByRole("listitem")
    .filter({ hasText: "Fire safety audit" })
    .first();
  await item.getByRole("button", { name: "Open case" }).click();
  const dialog = page.getByRole("dialog", { name: "Open a case" });
  await dialog.getByLabel("New client").fill(clientName);
  await dialog.getByRole("button", { name: "Open case" }).click();
  await expect(page).toHaveURL(/\/cases\//);
  caseUrl = page.url();

  await expect(page.getByRole("link", { name: clientName }).first()).toBeVisible();
  await expect(page.getByText("Translated from Malayalam").first()).toBeVisible();
  for (const tab of [/What must happen/, /Thread/, /Demand and interest/, /Activity/]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
  }
  await page.getByRole("tab", { name: /Activity/ }).click();
  await expect(
    page
      .getByRole("tabpanel")
      .getByText(/Asha Rao/)
      .first(),
  ).toBeVisible();

  // The proof: a finding opens its page, outlined.
  await page.getByRole("tab", { name: /What must happen/ }).click();
  await page
    .getByRole("button", { name: /Show on the page, Page 2/ })
    .first()
    .click();
  const viewer = page.getByRole("region", { name: /Proof viewer/ }).first();
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("2 / 3")).toBeVisible();
  await expect(viewer.getByRole("button", { name: /^Highlighted:/ }).first()).toBeVisible();

  // The tray now opens the filed notice on its case page.
  await page.goto("/inbox");
  await page.waitForLoadState("networkidle"); // hydrated: the file inputs listen
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(fixture("circular-NMR-SAF-2026-041.pdf"));
  const dup = trayItem(page, "circular-NMR-SAF-2026-041.pdf");
  await expect(dup.getByText("Already in the register")).toBeVisible({ timeout: 30_000 });
  await dup.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/cases\/[^?]+\?doc=/);
  await expect(page.getByRole("link", { name: clientName }).first()).toBeVisible();
  expect(problems()).toEqual([]);
});

test("mark a duty done, then reopen it", async ({ page }) => {
  await signInOwner(page);
  await page.goto(caseUrl);
  // Mark done sits on each duty's card.
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: /^Mark done$/ })
    .first()
    .click();
  await expect(page.getByText(/^Marked done: /).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: /^Reopen$/ })
    .first()
    .click();
  await expect(page.getByText(/^Reopened: /).first()).toBeVisible();
});

test("a comment that mentions a colleague reaches their bell", async ({ page, browser }) => {
  await signInOwner(page);
  const link = await invite(page, colleague.email);
  const { context, page: ravi } = await join(browser, link, colleague.name);

  await page.goto(caseUrl);
  // Notes live with the activity; Thread holds the documents.
  await page.getByRole("tab", { name: /Activity/ }).click();
  const box = page.getByPlaceholder("Write a note. Type @ to mention someone.");
  await box.click();
  await box.pressSequentially(
    `Please check the extinguisher dates @${colleague.name.split(" ")[0]}`,
  );
  await page.getByRole("option", { name: new RegExp(colleague.name) }).click();
  await box.press("Control+Enter");
  await expect(page.getByText("Please check the extinguisher dates").first()).toBeVisible();

  await ravi.goto("/today");
  await ravi.getByRole("button", { name: "Notifications" }).click();
  await expect(ravi.getByText(/Mentioned on/).first()).toBeVisible();
  await ravi
    .getByText(/Mentioned on/)
    .first()
    .click();
  await expect(ravi).toHaveURL(/\/cases\//);
  await context.close();
});
