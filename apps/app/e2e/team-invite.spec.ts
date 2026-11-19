/**
 * The invitation journey (H1): the owner invites someone from Team & access,
 * copies the tokenised link (no mail server in e2e), and the invitee signs
 * up through it in a fresh browser and lands in the organisation. The
 * invited address alone opens nothing, and the link works once.
 */
import { expect, type Page, test } from "@playwright/test";

/** A made-up client address (TEST-NET-2), so sign-ins don't share one rate-limit bucket. */
function testClientAddress(): string {
  const n = () => Math.floor(Math.random() * 250) + 1;
  return `198.51.${n()}.${n()}`;
}

const PASSWORD = "a-long-test-password";

/** Sign in as the owner another spec made, or sign up first on a fresh run. */
async function signInOwner(page: Page) {
  const base = test.info().project.use.baseURL as string;
  const body = { email: "asha@harbour.test", password: PASSWORD, name: "Asha Rao" };
  // A client address of its own: every spec signs in from this one machine, and
  // Better Auth allows 20 sign-ins per address in 15 minutes.
  const headers = { origin: base, "x-forwarded-for": testClientAddress() };
  const res = await page.request.post("/api/auth/sign-in/email", { data: body, headers });
  if (res.ok()) return;
  const up = await page.request.post("/api/auth/sign-up/email", { data: body, headers });
  expect(up.status()).toBe(200);
}

test("invite from Team & access, then join through the copied link", async ({ page, browser }) => {
  await signInOwner(page);
  const invitee = `ravi.${Date.now()}@harbour.test`;

  await page.goto("/settings/team");
  await page.getByRole("button", { name: "Invite people" }).click();
  await page.getByLabel("Email addresses").fill(invitee);
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const copy = page.getByRole("button", { name: `Copy sign-up link for ${invitee}` });
  await expect(copy).toBeVisible();
  // Catch what the copy button writes (headless Chrome's clipboard can't be read back).
  await page.evaluate(() => {
    const w = window as unknown as { __copied?: string };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (t: string) => {
          w.__copied = t;
        },
      },
    });
  });
  await copy.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __copied?: string }).__copied ?? ""))
    .not.toBe("");
  const link = await page.evaluate(
    () => (window as unknown as { __copied?: string }).__copied ?? "",
  );
  expect(link).toMatch(/\/sign-up\?invite=[\w.%-]+$/);
  expect(link).not.toContain("ravi");

  // The invitee is on another machine: their own address for the per-IP
  // sign-up limit, which the other specs' sign-ups have used up.
  const fresh = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": "198.51.100.23" },
  });
  const guest = await fresh.newPage();
  // The address alone shows nothing about the invitation.
  await guest.goto(`/sign-up?email=${encodeURIComponent(invitee)}`);
  await expect(guest.getByRole("heading", { name: "Sign-up is by invitation" })).toBeVisible();

  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: /^Join / })).toBeVisible();
  await expect(guest.getByLabel("Work email")).toHaveValue(invitee);
  await guest.getByLabel("Full name").fill("Ravi Iyer");
  await guest.getByLabel("Password").fill(PASSWORD);
  await guest.getByRole("button", { name: "Create account" }).click();
  await guest.waitForURL(/\/today$/);
  await expect(guest.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await fresh.close();

  // Used up: the same link now says it doesn't work.
  const later = await browser.newContext();
  const again = await later.newPage();
  await again.goto(link);
  await expect(
    again.getByRole("heading", { name: "This invitation link doesn't work" }),
  ).toBeVisible();
  await later.close();
});
