/**
 * Named x-journeys-*.spec.ts so they run after the other specs (name order)
 * and never change what those find.
 *
 * Shared steps for the x-journeys-*.spec.ts files: signing in as the owner the
 * other specs use, inviting someone and signing them up through the link, a
 * TOTP code for two-step sign-in, and a watch on the browser console (a CSP
 * refusal or an uncaught error fails the journey).
 */
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";

export const OWNER = {
  email: "asha@harbour.test",
  password: "a-long-test-password",
  name: "Asha Rao",
};

export const fixture = (name: string) =>
  fileURLToPath(new URL(`../../../services/engine/tests/fixtures/${name}`, import.meta.url));

/** A suffix that keeps people and clients from one run apart from another's. */
export const RUN = Date.now().toString(36).slice(-5);

/**
 * Sign in as the owner, or sign up first when no other spec has (the first
 * person owns the organisation). Sign-in first: Better Auth allows only a few
 * sign-ups an hour from one address, and the invitations below need them.
 */
export async function signInOwner(page: Page) {
  const base = test.info().project.use.baseURL as string;
  const headers = { origin: base, "x-forwarded-for": freshAddress() };
  const signIn = () =>
    page.request.post("/api/auth/sign-in/email", {
      data: { email: OWNER.email, password: OWNER.password },
      headers,
    });
  if ((await signIn()).ok()) return;
  const up = await page.request.post("/api/auth/sign-up/email", { data: OWNER, headers });
  if (up.ok()) return;
  expect((await signIn()).status()).toBe(200);
}

let address = 10;
/**
 * A client address of its own for each sign-in and each person's browser.
 * Every request here comes from one machine, and Better Auth allows 20
 * sign-ins and 3 sign-ups per address: without this the journeys would use
 * up the other specs' allowance too.
 */
export function freshAddress(): string {
  address += 1;
  return `198.18.${Math.floor(address / 250) % 250}.${(address % 250) + 1}`;
}

/** Gives each test's own browser a fresh address too (sign-ins through the form). */
export function ownAddressPerTest() {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": freshAddress() });
  });
}
/**
 * A browser of its own for another person. Each gets its own client address
 * (Better Auth reads X-Forwarded-For), as people signing up from their own
 * machines would: Better Auth allows three sign-ups an hour per address.
 */
export function personContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: test.info().project.use.baseURL as string,
    timezoneId: "Asia/Kolkata",
    extraHTTPHeaders: { "x-forwarded-for": freshAddress() },
  });
}

/**
 * Collects what a person would never see but a broken page shows in the
 * console: uncaught errors and Content-Security-Policy refusals.
 */
export function watchConsole(page: Page): () => string[] {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to/.test(m.text()))
      problems.push(`csp: ${m.text().slice(0, 200)}`);
  });
  return () => problems;
}

/** The owner invites `email` from Settings → Team and copies the sign-up link. */
export async function invite(
  owner: Page,
  email: string,
  role: RegExp = /^Member/,
): Promise<string> {
  await owner.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await owner.goto("/settings/team");
  await owner.getByRole("button", { name: "Invite people" }).click();
  const dialog = owner.getByRole("dialog", { name: "Invite people" });
  await dialog.getByLabel("Email addresses").fill(email);
  await dialog.getByRole("combobox", { name: "Role" }).click();
  await owner.getByRole("option", { name: role }).click();
  await dialog.getByRole("button", { name: /^Invite/ }).click();
  await expect(dialog).toBeHidden();
  await owner.getByRole("button", { name: `Copy sign-up link for ${email}` }).click();
  await expect(owner.getByText("Sign-up link copied").first()).toBeVisible();
  return owner.evaluate(() => navigator.clipboard.readText());
}

/** Opens the invitation link in a fresh browser and signs up as `name`. */
export async function join(
  browser: Browser,
  link: string,
  name: string,
  password = "another-long-password",
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await personContext(browser);
  const page = await context.newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: /^Join / })).toBeVisible();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/today/);
  return { context, page };
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) for a base32 secret, as an authenticator app shows it. */
export function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) {
    const v = alphabet.indexOf(ch);
    if (v >= 0) bits += v.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g)?.map((b) => Number.parseInt(b, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const offset = (h[h.length - 1] ?? 0) & 0xf;
  const n = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return n.toString().padStart(6, "0");
}
