/**
 * Journeys: accounts. The setup wizard, invitations and the sign-up link,
 * what each role may open, signing out and in (a wrong password, two-step
 * codes, a passkey), asking for a password reset, a member who was removed,
 * and an expired session. Runs on the shared Playwright server (desktop
 * edition, PGlite, fake engine); people get a per-run suffix.
 */
import { expect, type Page, test } from "@playwright/test";
import {
  invite,
  join,
  OWNER,
  personContext,
  RUN,
  signInOwner,
  totp,
  watchConsole,
} from "./journeys-helpers";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

const member = { email: `vik-${RUN}@harbour.test`, name: `Vikram ${RUN}` };
const viewer = { email: `nina-${RUN}@harbour.test`, name: `Nina ${RUN}` };
let memberLink = "";

async function signOut(page: Page) {
  await page.getByRole("button", { name: /account menu/ }).click();
  await page.getByRole("menuitem", { name: /Sign out/ }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

test("every page names its icon, and a dialog's scroll lock isn't refused by the CSP", async ({
  page,
}) => {
  const problems = watchConsole(page);
  await signInOwner(page);
  await page.goto("/today");
  const icon = page.locator('link[rel="icon"]').first();
  await expect(icon).toHaveAttribute("href", /\/icons\//);
  const href = (await icon.getAttribute("href")) as string;
  expect((await page.request.get(href)).status()).toBe(200);
  expect((await page.request.get("/icons/apple-touch-icon.png")).status()).toBe(200);

  await page.goto("/settings/team");
  await page.getByRole("button", { name: "Invite people" }).click();
  await expect(page.getByRole("dialog", { name: "Invite people" })).toBeVisible();
  // react-remove-scroll adds its <style> at run time; with the nonce it applies.
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
    .toBe("hidden");
  await page.keyboard.press("Escape");
  expect(problems()).toEqual([]);
});

test("the setup wizard walks through every step and lands in the Inbox", async ({ page }) => {
  const problems = watchConsole(page);
  await signInOwner(page);
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { name: "Name your organisation" })).toBeVisible();
  await expect(page.getByLabel("Organisation name")).not.toHaveValue("");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Which notices do you handle?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Choose how AI is used" })).toBeVisible();
  // Desktop: the hosted AI plan is offered, but not selectable here.
  await expect(page.getByText("Available on the hosted edition.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Invite your team" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("heading", { name: "Upload your first notice" })).toBeVisible();
  await page.getByRole("button", { name: "Go to Inbox" }).click();
  await expect(page).toHaveURL(/\/inbox/);
  await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
  expect(problems()).toEqual([]);
});

test("an invited member joins through the link, with the address fixed", async ({
  page,
  browser,
}) => {
  await signInOwner(page);
  memberLink = await invite(page, member.email);
  expect(memberLink).toContain(`/sign-up?email=${encodeURIComponent(member.email)}`);
  await expect(page.getByRole("cell", { name: member.email, exact: true })).toBeVisible();

  const joined = await join(browser, memberLink, member.name);
  await expect(
    joined.page.getByRole("button", { name: new RegExp(`${member.name}.*account menu`) }),
  ).toBeVisible();
  // Members see their own team view but not the admin sections.
  for (const path of ["/settings/organisation", "/settings/system", "/settings/ai"]) {
    await joined.page.goto(path);
    await expect(
      joined.page
        .getByRole("heading", { name: "You don't have access to this" })
        .filter({ visible: true }),
    ).toBeVisible();
  }
  await joined.page.goto("/welcome");
  await expect(joined.page).toHaveURL(/\/today/);
  await joined.context.close();

  // The invitation is used up: the owner sees a member, not a pending invite.
  await page.goto("/settings/team");
  await expect(
    page.getByRole("button", { name: `Copy sign-up link for ${member.email}` }),
  ).toHaveCount(0);
  await expect(page.getByText(member.email)).toBeVisible();
});

test("a viewer reads but can't change anything", async ({ page, browser }) => {
  await signInOwner(page);
  const link = await invite(page, viewer.email, /^Viewer/);
  const { context, page: v } = await join(browser, link, viewer.name);
  await v.goto("/clients");
  await expect(v.getByRole("heading", { level: 1, name: "Clients" })).toBeVisible();
  await expect(v.getByRole("button", { name: "New client" })).toHaveCount(0);
  await expect(v.getByRole("button", { name: "Import" })).toHaveCount(0);
  await v.goto("/deadlines");
  await expect(v.getByRole("button", { name: "Add deadline" })).toHaveCount(0);
  await v.goto("/settings/team");
  await expect(v.getByRole("button", { name: "Invite people" })).toHaveCount(0);
  await context.close();
});

test("sign out, a wrong password, then back in", async ({ browser }) => {
  const context = await personContext(browser);
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(member.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
  // An unknown address gets the same answer: it doesn't reveal who has an account.
  await page.getByLabel("Work email").fill(`nobody-${RUN}@harbour.test`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();

  await page.getByLabel("Work email").fill(member.email);
  await page.getByLabel("Password").fill("another-long-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/today/);
  await signOut(page);
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Ftoday/);
  await context.close();
});

test("asking for a password reset never says whether the account exists", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByLabel("Work email").fill(member.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // A stale or made-up link says so, rather than failing on submit.
  await page.goto("/reset-password?error=INVALID_TOKEN");
  await expect(page.getByText(/expired|no longer|used/i).first()).toBeVisible();
});

test("two-step verification: turn it on, then sign in with a code", async ({ browser }) => {
  const context = await personContext(browser);
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(member.email);
  await page.getByLabel("Password").fill("another-long-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/today/);

  await page.goto("/settings/me");
  await page.getByRole("button", { name: /Turn on/ }).click();
  const dialog = page.getByRole("dialog", { name: "Turn on two-step verification" });
  await dialog.getByLabel("Password").fill("wrong-password-123");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByText("That password isn't right.")).toBeVisible();
  await dialog.getByLabel("Password").fill("another-long-password");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog.getByRole("list", { name: "Backup codes" })).toBeVisible();
  const secret = (await dialog.getByText(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/).innerText()).replace(
    /\s+/g,
    "",
  );
  await dialog.getByLabel("Code from your app").fill("000000");
  await dialog.getByRole("button", { name: "Verify and turn on" }).click();
  await expect(dialog.getByText("That code didn't work.", { exact: false })).toBeVisible();
  await dialog.getByLabel("Code from your app").fill(totp(secret));
  await dialog.getByRole("button", { name: "Verify and turn on" }).click();
  await expect(page.getByText("Two-step verification is on").first()).toBeVisible();

  await signOut(page);
  await page.getByLabel("Work email").fill(member.email);
  await page.getByLabel("Password").fill("another-long-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const code = page.getByLabel(/code/i).first();
  await expect(code).toBeVisible();
  await code.fill(totp(secret));
  await page
    .getByRole("button", { name: /Verify|Sign in|Continue/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/today/);
  await context.close();
});

test("a passkey: add one, then sign in with it", async ({ browser }) => {
  const context = await personContext(browser);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await signInOwner(page);
  await page.goto("/settings/me");
  await expect(page.getByText("No passkeys yet")).toBeVisible();
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText("Passkey added").first()).toBeVisible();
  await expect(page.getByText("No passkeys yet")).toHaveCount(0);

  await signOut(page);
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByRole("button", { name: /Asha Rao.*account menu/ })).toBeVisible();

  // Tidy up, so the next run starts with none.
  await page.goto("/settings/me");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: /^Remove / })
    .first()
    .click();
  await page.getByRole("button", { name: "Remove passkey" }).click();
  await expect(page.getByText("No passkeys yet")).toBeVisible();
  await context.close();
});

test("a removed member is told why they can't get in", async ({ page, browser }) => {
  await signInOwner(page);
  await page.goto("/settings/team");
  await page.getByRole("button", { name: `More for ${viewer.name}` }).click();
  await page.getByRole("menuitem", { name: "Remove from organisation" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText(`${viewer.name} removed`).first()).toBeVisible();

  const context = await personContext(browser);
  const v = await context.newPage();
  await v.goto("/sign-in");
  await v.getByLabel("Work email").fill(viewer.email);
  await v.getByLabel("Password").fill("another-long-password");
  await v.getByRole("button", { name: "Sign in", exact: true }).click();
  // Before: signed in, sent to Today, bounced back here with no reason given.
  await expect(v.getByText(/isn't a member of an organisation here/)).toBeVisible();
  await context.close();
});

test("an expired session goes to sign-in and comes back to the page", async ({ page }) => {
  await signInOwner(page);
  await page.goto("/deadlines");
  await page.context().clearCookies();
  await page.goto("/deadlines?view=calendar");
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  await page.getByLabel("Work email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/deadlines\?view=calendar/);
  await expect(page.getByRole("heading", { level: 1, name: "Deadlines" })).toBeVisible();
});
