/**
 * Layout (packages/ui README, "Layout"): every screen at 390, 768, 1440 and
 * 2560 wide. Nothing scrolls sideways or is cut off at the screen's edge,
 * the page title and the content share a left edge, and the content uses the
 * width its page allows (on Today the panels end where the numbers do).
 *
 * Runs on the shared Playwright server. It only reads, except that when no
 * case exists yet it files the board minutes in one (a document no other spec
 * uploads, so the ASMT-10 notice stays new for the specs after it).
 */
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const MINUTES = fileURLToPath(
  new URL("../../../services/engine/tests/fixtures/minutes-board-87.pdf", import.meta.url),
);
const ACCOUNT = { email: "asha@harbour.test", password: "a-long-test-password", name: "Asha Rao" };
const WIDTHS = [390, 768, 1440, 2560] as const;

async function signIn(page: Page) {
  const base = test.info().project.use.baseURL as string;
  const headers = { origin: base };
  const up = await page.request.post("/api/auth/sign-up/email", { data: ACCOUNT, headers });
  if (up.ok()) return;
  const res = await page.request.post("/api/auth/sign-in/email", { data: ACCOUNT, headers });
  expect(res.status()).toBe(200);
}

/** A case page: the first in the register, or one opened for the board minutes. */
async function caseUrl(page: Page): Promise<string> {
  await page.goto("/notices");
  const grid = page.getByRole("grid", { name: "Notices" });
  await expect(grid).toBeVisible();
  const row = grid.getByRole("row").nth(1);
  await row.waitFor({ timeout: 5_000 }).catch(() => {});
  if (await row.count()) {
    await row.getByRole("gridcell").nth(1).click();
    await page.waitForURL(/\/(cases|notices)\/[^/?]+/);
    return page.url();
  }
  await page.goto("/inbox");
  await page.locator('input[type="file"]').first().setInputFiles(MINUTES);
  const item = page
    .getByRole("list", { name: "To file in a case" })
    .getByRole("listitem")
    .filter({ hasText: /Board|minutes/i })
    .first();
  await expect(item).toBeVisible({ timeout: 90_000 });
  await item.getByRole("button", { name: "Open case" }).click();
  const dialog = page.getByRole("dialog", { name: "Open a case" });
  await dialog.getByLabel("New client").fill("Northline Metro Rail Corporation");
  await dialog.getByRole("button", { name: "Open case" }).click();
  await page.waitForURL(/\/cases\//);
  return page.url();
}

interface Screen {
  name: string;
  path: string | (() => string);
  /** Signed out (sign-in, sign-up). */
  anon?: boolean;
  /** Not a page template (the A4 report, the wizard, auth): only overflow and clipping apply. */
  free?: boolean;
  ready?: (page: Page) => Promise<void>;
}

let kase = "";
const screens: Screen[] = [
  { name: "sign-in", path: "/sign-in", anon: true, free: true },
  { name: "sign-up", path: "/sign-up", anon: true, free: true },
  { name: "wizard", path: "/welcome", free: true },
  { name: "Today", path: "/today" },
  { name: "Inbox", path: "/inbox" },
  { name: "Notices", path: "/notices" },
  { name: "case page", path: () => kase },
  {
    name: "case page, demand",
    path: () => kase,
    ready: async (page) => {
      // On phones the page opens over the tabs; the screen is then measured as it is.
      await page
        .getByRole("tab", { name: /Demand and interest/ })
        .click({ timeout: 3_000 })
        .catch(() => {});
    },
  },
  { name: "Deadlines", path: "/deadlines" },
  {
    name: "Deadlines calendar",
    path: "/deadlines",
    ready: (page) => page.getByRole("radio", { name: "Calendar" }).click(),
  },
  {
    name: "Deadlines timeline",
    path: "/deadlines",
    ready: (page) => page.getByRole("radio", { name: "Timeline" }).click(),
  },
  { name: "Clients", path: "/clients" },
  {
    name: "client page",
    path: "/clients",
    ready: async (page) => {
      await page
        .getByRole("grid", { name: /Clients/ })
        .getByRole("row")
        .nth(1)
        .getByRole("gridcell")
        .nth(1)
        .click();
      await page.waitForURL(/\/clients\/[^?]+$/);
    },
  },
  { name: "Search", path: "/search?q=the" },
  { name: "Reports", path: "/reports" },
  { name: "evidence report", path: "/reports/evidence?range=2020-01-01..2035-12-31", free: true },
  { name: "Capture", path: "/capture" },
  { name: "Settings, me", path: "/settings/me" },
  { name: "Settings, organisation", path: "/settings/organisation" },
  { name: "Settings, team", path: "/settings/team" },
  { name: "Settings, AI", path: "/settings/ai" },
  { name: "Settings, notice types", path: "/settings/profiles" },
  { name: "Settings, intake", path: "/settings/intake" },
  { name: "Settings, system", path: "/settings/system" },
];

interface Measure {
  scrollWidth: number;
  clientWidth: number;
  /** Elements past the screen's edge, outside any scrolling frame. */
  clipped: string[];
  /** The page column, when the screen is a page template. */
  column: null | {
    gutter: number;
    headerLeft: number;
    contentLeft: number;
    bodyLeft: number;
    bodyRight: number;
    usedRight: number;
  };
}

/** Geometry of the page as it is now. Runs in the browser. */
function measure(): Measure {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  };
  const describe = (el: Element) =>
    `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${[...el.classList].join(".")} "${(el.textContent ?? "").trim().slice(0, 40)}"`;
  /** Inside a frame that scrolls or clips on purpose (a wide table, an ellipsis, a visually hidden label). */
  const framed = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflowX !== "visible" || s.clipPath !== "none" || s.clip !== "auto") return true;
      if (s.position === "fixed") return false;
    }
    return false;
  };
  const clipped: string[] = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el) || el.closest("[aria-hidden='true'], [inert]")) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !framed(el)) clipped.push(describe(el));
  }

  let column: Measure["column"] = null;
  const col = document.querySelector<HTMLElement>("main [data-width]");
  const h1 = col?.querySelector("h1");
  if (col && h1) {
    const kids = [...col.children] as HTMLElement[];
    const header = kids.find((k) => k.contains(h1));
    const body = kids.at(-1);
    if (header && body) {
      const box = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
          left: r.left + Number.parseFloat(s.paddingLeft),
          right: r.right - Number.parseFloat(s.paddingRight),
        };
      };
      const content = [
        ...body.querySelectorAll<HTMLElement>(
          "section, ul, ol, table, form, nav, h2, [role=grid], [role=list], [role=tablist], [data-min], button",
        ),
      ].find(visible);
      let usedRight = 0;
      for (const el of body.querySelectorAll("*")) {
        if (visible(el)) usedRight = Math.max(usedRight, el.getBoundingClientRect().right);
      }
      column = {
        gutter: Number.parseFloat(getComputedStyle(doc).getPropertyValue("--dp-page-gutter")),
        headerLeft: box(header).left,
        contentLeft: content ? content.getBoundingClientRect().left : box(body).left,
        bodyLeft: box(body).left,
        bodyRight: box(body).right,
        usedRight,
      };
    }
  }
  return { scrollWidth: doc.scrollWidth, clientWidth: vw, clipped, column };
}

test.describe.configure({ mode: "serial", timeout: 900_000 });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await signIn(page);
  kase = await caseUrl(page);
  await page.close();
});

for (const width of WIDTHS) {
  test(`every screen fits and lines up at ${width} wide`, async ({ browser }) => {
    const phone = width < 600;
    const options = {
      viewport: { width, height: phone ? 844 : 900 },
      ...(phone ? { isMobile: true, hasTouch: true } : {}),
    };
    const signedIn = await browser.newContext(options);
    const signedOut = await browser.newContext(options);
    const page = await signedIn.newPage();
    const anon = await signedOut.newPage();
    await signIn(page);

    for (const s of screens) {
      const p = s.anon ? anon : page;
      await p.goto(typeof s.path === "string" ? s.path : s.path());
      await expect(p.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await s.ready?.(p);
      await p.waitForTimeout(400);
      const m = await p.evaluate(measure);
      const where = `${s.name} at ${width}`;

      expect.soft(m.scrollWidth, `${where}: scrolls sideways`).toBeLessThanOrEqual(m.clientWidth);
      expect.soft(m.clipped, `${where}: cut off at the screen's edge`).toEqual([]);
      if (s.free) continue;

      expect.soft(m.column, `${where}: not in a page template`).not.toBeNull();
      if (!m.column) continue;
      const c = m.column;
      // Phones give tables 8 more each side than the title; everywhere else the edges match.
      const slack = phone ? 8 : 1;
      expect
        .soft(Math.abs(c.bodyLeft - c.headerLeft), `${where}: body and title left edges`)
        .toBeLessThanOrEqual(slack);
      expect
        .soft(Math.abs(c.contentLeft - c.headerLeft), `${where}: content and title left edges`)
        .toBeLessThanOrEqual(slack);
      // The content reaches the page's right edge (within a gutter): no empty strip beside it.
      expect
        .soft(c.usedRight, `${where}: content stops short of the page's right edge`)
        .toBeGreaterThanOrEqual(c.bodyRight - c.gutter);
    }

    // Today: the panel grid ends where the numbers do, and both fill the page.
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
    const today = await page.evaluate(() => {
      const r = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
      const gutter = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--dp-page-gutter"),
      );
      const main = document.querySelector("main")?.getBoundingClientRect() ?? null;
      return { stats: r('[data-min="stat"]'), panels: r('[data-min="panel"]'), main, gutter };
    });
    expect(today.stats && today.panels && today.main).toBeTruthy();
    if (today.stats && today.panels && today.main) {
      expect(Math.abs(today.panels.right - today.stats.right)).toBeLessThanOrEqual(today.gutter);
      expect(Math.abs(today.panels.left - today.stats.left)).toBeLessThanOrEqual(1);
      // Full width: the grids end one gutter from the main area's edge.
      expect(today.main.right - today.panels.right).toBeLessThanOrEqual(today.gutter * 2);
    }

    await signedIn.close();
    await signedOut.close();
  });
}
