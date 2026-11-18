/**
 * Business features from the app's side (08 §1, §5), on PGlite with Better
 * Auth: the free build (no ee/) changes nothing and offers nothing; with ee/
 * and a licence, the owner installs it, reports go white-label, audit export
 * downloads a verifiable chain, and SSO set-up is open to admins. The
 * licence fixtures are signed with the TEST key (trusted under NODE_ENV=test)
 * and expire on 2029-01-03.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { createAuth, inviteToken } from "@dueproof/auth";
import { createDatabase, type Database, invitation, migrate, uuidv7 } from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { NO_LICENCE } from "@dueproof/plugins";
import { LocalDiskStorage } from "@dueproof/storage";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installLicence, removeLicence, saveSso } from "../app/actions/business";
import { GET as auditExportRoute } from "../app/api/v1/audit-export/route";
import { authorize } from "../lib/authorize";
import { parseAuditExportQuery, ssoSettingsFor, ssoSignInAvailable } from "../lib/business";
import { loadEe, setEeForTests } from "../lib/ee";
import { parseEnv } from "../lib/env";
import { licenceStatus, whiteLabelReports } from "../lib/licence";
import { businessAuth, type Container, createEngine, setContainer } from "../lib/server/container";
import { listAudit } from "../lib/system";

const APP = "http://localhost:3000";
const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/licences/${name}`, import.meta.url), "utf8");

const EE = loadEe();
let dir: string;
let database: Database;
let container: Container;
let owner: string;
let admin: string;

async function signUp(email: string, name: string, invitationId?: string): Promise<string> {
  const res = await container.auth.api.signUpEmail({
    body: {
      email,
      name,
      password: "a-long-test-password",
      // An invitation's link carries its token (H1).
      ...(invitationId
        ? { inviteToken: inviteToken(container.env.AUTH_SECRET, invitationId) }
        : {}),
    },
    returnHeaders: true,
  });
  return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

function as(cookie: string) {
  request.headers = new Headers({ cookie, origin: APP });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "dueproof-business-"));
  const env = parseEnv({
    NODE_ENV: "test",
    APP_URL: APP,
    AUTH_SECRET: "test-auth-secret-test-auth-secret-0123456789",
    AUTH_SIGNUP: "first-user",
    STORAGE_LOCAL_DIR: dir,
  });
  database = await createDatabase({ driver: "pglite" });
  await migrate(database);
  const storage = new LocalDiskStorage({
    root: dir,
    publicUrl: `${APP}/api/storage/local`,
    secret: env.STORAGE_SIGNING_SECRET,
  });
  container = {
    env,
    database,
    auth: createAuth({
      ...businessAuth(env, database),
      database,
      baseURL: APP,
      secret: env.AUTH_SECRET,
      signupPolicy: "first-user",
      rateLimit: false,
    }),
    storage,
    engineStorage: storage,
    engine: createEngine(env, storage),
    startPipeline: async () => "unused",
  };
  setContainer(container);
  owner = await signUp("owner@firm.test", "Owner");
  as(owner);
  const ctx = await authorize("team.manage");
  const invitationId = uuidv7();
  await unsafeRawDb(database)
    .insert(invitation)
    .values({
      id: invitationId,
      organizationId: ctx.orgId,
      email: "admin@firm.test",
      role: "admin",
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: ctx.userId,
    });
  admin = await signUp("admin@firm.test", "Admin", invitationId);
});

afterEach(() => setEeForTests(undefined));

afterAll(async () => {
  setContainer(undefined);
  await database.close();
  await rm(dir, { recursive: true, force: true });
});

describe("the free build (no ee/)", () => {
  it("has no licence, offers no Business features and changes nothing", async () => {
    setEeForTests(null);
    as(owner);
    expect(await licenceStatus(database)).toEqual(NO_LICENCE);
    expect(await whiteLabelReports(container)).toBe(false);
    expect(await ssoSignInAvailable(container)).toBe(false);
    const ctx = await authorize("team.manage");
    expect(await ssoSettingsFor(ctx)).toMatchObject({ available: false, licensed: false });
    expect(await installLicence(fixture("business.TEST.dueproof-licence"))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/no Business features/),
    });
    const res = await auditExportRoute(new Request(`${APP}/api/v1/audit-export`, request));
    expect(res.status).toBe(403);
  });

  it("keeps REPORT_WHITE_LABEL as a development override", async () => {
    setEeForTests(null);
    expect(
      await whiteLabelReports({ database, env: { ...container.env, REPORT_WHITE_LABEL: true } }),
    ).toBe(true);
  });
});

describe("the ee/ boundary (house rule 12)", () => {
  it("nothing outside ee/ imports it, except through @dueproof/ee-entry in lib/ee.ts", () => {
    const root = join(__dirname, "..", "..", "..");
    const eeDir = join(root, "ee");
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        if (["node_modules", ".next", ".turbo", "dist", "ee", ".git", "out"].includes(name))
          continue;
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) {
          const text = readFileSync(p, "utf8");
          const rel = relative(root, p);
          const imports = [...text.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map(
            (m) => m[1] ?? "",
          );
          for (const spec of imports) {
            const target = spec.startsWith(".") ? resolve(dirname(p), spec) : "";
            const bad =
              spec === "@dueproof/ee" ||
              spec.startsWith("@dueproof/ee/") ||
              target === eeDir ||
              target.startsWith(`${eeDir}/`) ||
              (spec === "@dueproof/ee-entry" && rel !== join("apps", "app", "lib", "ee.ts"));
            if (bad) offenders.push(`${rel}: ${spec}`);
          }
        }
      }
    };
    for (const top of ["apps", "packages", "infra", "evals"]) walk(join(root, top));
    expect(offenders).toEqual([]);
  });
});

describe.skipIf(EE === null)("with ee/ and a Business licence", () => {
  it("only an owner may install a licence, and a bad one is refused", async () => {
    as(admin);
    expect(await installLicence(fixture("business.TEST.dueproof-licence"))).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    as(owner);
    expect(await installLicence(fixture("wrong-key.TEST.dueproof-licence"))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/doesn't check out/),
    });
    const tampered = fixture("business.TEST.dueproof-licence").replace(
      '\\"seats\\":10',
      '\\"seats\\":999',
    );
    expect(tampered).not.toBe(fixture("business.TEST.dueproof-licence"));
    expect(await installLicence(tampered)).toMatchObject({ ok: false });
    expect(await installLicence("not a licence")).toMatchObject({ ok: false });
    expect((await licenceStatus(database)).state).toBe("none");
  });

  it("installs a licence, turns on white-label reports, and records it", async () => {
    as(owner);
    expect(await whiteLabelReports(container)).toBe(false);
    const res = await installLicence(fixture("business.TEST.dueproof-licence"));
    expect(res).toMatchObject({ ok: true, data: { state: "valid" } });
    expect((await licenceStatus(database)).active).toEqual(["sso", "audit-export", "white-label"]);
    expect(await whiteLabelReports(container)).toBe(true);
    const rows = await listAudit(await authorize("audit.view"), 0);
    expect(rows.map((r) => r.action)).toContain("licence.install");
  });

  it("downloads the audit trail with a chain that verifies, and audits the download", async () => {
    as(owner);
    const res = await auditExportRoute(
      new Request(`${APP}/api/v1/audit-export?format=jsonl`, { headers: request.headers }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="dueproof-audit-/);
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines.length).toBeGreaterThan(2);
    expect(lines[0].prevHash).toBeNull();
    const report = await auditExportRoute(
      new Request(`${APP}/api/v1/audit-export?part=report&format=csv`, {
        headers: request.headers,
      }),
    );
    const r = await report.json();
    expect(r).toMatchObject({ format: "dueproof-audit-verification", chain: { ok: true } });
    const rows = await listAudit(await authorize("audit.view"), 0);
    expect(rows.filter((x) => x.action === "audit.export").length).toBeGreaterThanOrEqual(2);
  });

  it("refuses bad export queries", () => {
    expect(() => parseAuditExportQuery(new URLSearchParams("from=2026-13-01"))).toThrow();
    expect(() =>
      parseAuditExportQuery(new URLSearchParams("from=2026-05-01&to=2026-04-01")),
    ).toThrow(/after/);
    expect(() => parseAuditExportQuery(new URLSearchParams("format=xlsx"))).toThrow();
  });

  it("opens SSO set-up to admins, checks the form, and keeps the sign-in button off until set up", async () => {
    as(admin);
    const ctx = await authorize("team.manage");
    const view = await ssoSettingsFor(ctx);
    expect(view).toMatchObject({ available: true, licensed: true, providers: [] });
    expect(view.serviceProvider?.acsUrl).toBe(`${APP}/api/auth/sso/saml2/sp/acs/saml-${ctx.orgId}`);
    expect(await ssoSignInAvailable(container)).toBe(false);
    expect(await saveSso({ domains: "gmail.com", metadataXml: "<x/>" })).toMatchObject({
      ok: false,
      error: "bad_request",
    });
  });

  it("a licence without white-label puts the Dueproof mark back; removing it switches everything off", async () => {
    as(owner);
    expect(await installLicence(fixture("sso-only.TEST.dueproof-licence"))).toMatchObject({
      ok: true,
    });
    expect(await whiteLabelReports(container)).toBe(false);
    const res = await auditExportRoute(
      new Request(`${APP}/api/v1/audit-export`, { headers: request.headers }),
    );
    expect(res.status).toBe(403);
    expect(await removeLicence()).toMatchObject({ ok: true, data: { state: "none" } });
    expect((await licenceStatus(database)).state).toBe("none");
  });
});

describe("hosted: the licence is the operator's (M5)", () => {
  const hostedEnv = (licence?: string) => ({
    ...container.env,
    DUEPROOF_EDITION: "hosted" as const,
    DUEPROOF_LICENCE: licence,
  });
  afterEach(() => setContainer(container));

  it("no tenant owner can install or remove the install-wide licence", async () => {
    // A self-hosted owner installed one (the shared row exists).
    as(owner);
    expect(await installLicence(fixture("business.TEST.dueproof-licence"))).toMatchObject({
      ok: true,
    });
    setContainer({ ...container, env: hostedEnv() });
    as(owner);
    expect(await removeLicence()).toMatchObject({ ok: false, error: "forbidden" });
    expect(await installLicence(fixture("sso-only.TEST.dueproof-licence"))).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    // The row is still there for self-hosted, untouched.
    setContainer(container);
    expect((await licenceStatus(container)).state).toBe("valid");
  });

  it("reads only DUEPROOF_LICENCE on hosted, never the shared row", async () => {
    expect((await licenceStatus({ database, env: hostedEnv() })).state).toBe("none");
    const fromEnv = await licenceStatus({
      database,
      env: hostedEnv(fixture("sso-only.TEST.dueproof-licence")),
    });
    expect(fromEnv.active).toEqual(["sso"]);
    // A bad file from the operator switches features off rather than failing.
    expect((await licenceStatus({ database, env: hostedEnv("garbage") })).state).toBe("none");
    as(owner);
    expect(await removeLicence()).toMatchObject({ ok: true });
  });
});
