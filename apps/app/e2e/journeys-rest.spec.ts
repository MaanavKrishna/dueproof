/**
 * Journeys: everything else a firm touches. Search and the command palette,
 * reports and their CSVs, the notifications bell, the three Today views,
 * every Settings page (with a save on each that has one), AI settings, notice
 * types and languages, intake, System (health, network, licence), a 404 and
 * the empty states; and the main journey at phone width.
 */
import { expect, test } from "@playwright/test";
import { fixture, RUN, signInOwner, watchConsole } from "./journeys-helpers";

test.describe.configure({ mode: "serial" });

test.describe("at desk width", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("search finds a page; the command palette opens with the keyboard", async ({ page }) => {
    const problems = watchConsole(page);
    await signInOwner(page);
    await page.goto("/inbox");
    await page.waitForLoadState("networkidle");
    // Something to find, whichever specs ran before.
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(fixture("invoice-HVC-2026-1183.pdf"));
    await expect(page.getByText(/Needs review|Ready|Already in the register/).first()).toBeVisible({
      timeout: 60_000,
    });

    await page.goto("/search");
    await expect(page.getByRole("heading", { level: 1, name: "Search" })).toBeVisible();
    await page.getByRole("searchbox").first().fill("early-settlement");
    await page.getByRole("searchbox").first().press("Enter");
    await expect(page.getByText(/result/).first()).toBeVisible();
    // A search with no hits says so.
    await page.goto(`/search?q=${encodeURIComponent(`zzqx-${RUN}`)}`);
    await expect(page.getByText(/No results|Nothing found|nothing matches/i).first()).toBeVisible();

    await page.goto("/today");
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox", { name: "Search commands" }).fill("Deadlines");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/deadlines/);
    expect(problems()).toEqual([]);
  });

  test("reports open, print and export CSV", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/reports");
    await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
    for (const [path, title] of [
      ["/reports/workload", "Workload"],
      ["/reports/exposure", "Exposure"],
      ["/reports/evidence?range=2020-01-01..2035-12-31", "Evidence report"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText("Prepared with Dueproof").first()).toBeVisible();
    }
    // Every report's table comes as CSV too.
    await page.goto("/reports/workload");
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "CSV" })
      .or(page.getByRole("link", { name: "CSV" }))
      .first()
      .click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  });

  test("the bell, and Today for me, my team and everyone", async ({ page }) => {
    await signInOwner(page);
    await page.goto("/today");
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
    const bell = page.getByRole("dialog", { name: "Notifications" });
    await bell.getByRole("radio", { name: "Unread" }).click();
    await expect(bell.getByRole("radio", { name: "Unread" })).toBeChecked();
    await page.keyboard.press("Escape");
    for (const view of ["Mine", "My team", "Everyone"]) {
      await page
        .getByRole("radiogroup", { name: "Whose work" })
        .getByRole("radio", { name: view })
        .click();
      await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
      await expect(page.getByText(/Overdue/).first()).toBeVisible();
    }
  });

  test("every Settings page opens, and the ones with a form save", async ({ page }) => {
    const problems = watchConsole(page);
    await signInOwner(page);

    await page.goto("/settings/me");
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("radio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.goto("/settings/organisation");
    const name = page.getByLabel("Firm name");
    const before = await name.inputValue();
    await name.fill(`${before} ${RUN}`);
    await page.getByRole("button", { name: /^Save/ }).first().click();
    await page.reload();
    await expect(page.getByLabel("Firm name")).toHaveValue(`${before} ${RUN}`);
    await page.getByLabel("Firm name").fill(before);
    await page.getByRole("button", { name: /^Save/ }).first().click();
    await page.reload();
    await expect(page.getByLabel("Firm name")).toHaveValue(before);

    await page.goto("/settings/ai");
    await page.getByRole("radio", { name: /Local model/ }).click();
    await expect(page.getByLabel("Address")).toBeVisible();
    await page.getByRole("radio", { name: /Your own key/ }).click();
    // No AI_KEY_MASTER on this server: it says so instead of taking a key it can't keep.
    await expect(page.getByText("This install can't store keys yet")).toBeVisible();
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("radio", { name: /^Off/ })).toBeChecked();

    await page.goto("/settings/profiles");
    await expect(page.getByRole("heading", { name: "Notice types" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Notice languages" })).toBeVisible();

    await page.goto("/settings/intake");
    await expect(page.getByText("/inbox?capture=1")).toBeVisible();

    await page.goto("/settings/system");
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(page.getByText("All systems working")).toBeVisible();
    await page.getByRole("button", { name: "Verify chain" }).click();
    await expect(page.getByText(/all intact/)).toBeVisible();
    await expect(page.getByText("No outside connections")).toBeVisible();
    // A licence that isn't one is refused, and Free stays Free.
    await page.getByRole("textbox", { name: "Licence file" }).fill("not a licence");
    await page.getByRole("button", { name: "Install licence" }).click();
    await expect(page.getByText("Couldn't install the licence").first()).toBeVisible();
    expect(problems()).toEqual([]);
  });

  test("a page that doesn't exist, and a case that doesn't", async ({ page }) => {
    await signInOwner(page);
    const res = await page.goto(`/no-such-page-${RUN}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
    await page.getByRole("link", { name: "Go to Today" }).click();
    await expect(page).toHaveURL(/\/today/);
    await page.goto("/cases/01900000-0000-7000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
    await page.goto("/notices/01900000-0000-7000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  });
});

test.describe("at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("Today, the Inbox, a case and Deadlines on a phone", async ({ page }) => {
    const problems = watchConsole(page);
    await signInOwner(page);
    await page.goto("/today");
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await page.goto("/inbox");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Take photo" })).toBeVisible();
    await page.goto("/notices");
    const row = page
      .getByRole("row")
      .nth(1)
      .or(
        page
          .getByRole("link")
          .filter({ hasText: /Overdue|Received/ })
          .first(),
      );
    if (await row.count()) {
      await row.first().click();
      await expect(page).toHaveURL(/\/cases\//);
      await expect(page.getByRole("tab", { name: /What must happen/ })).toBeVisible();
    }
    await page.goto("/deadlines");
    await expect(page.getByRole("heading", { level: 1, name: "Deadlines" })).toBeVisible();
    // Nothing wider than the screen.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    expect(problems()).toEqual([]);
  });
});
