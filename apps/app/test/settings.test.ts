/**
 * Settings, team and system, in-process on PGlite with Better Auth: the
 * server actions authorise, enforce the owner and self rules, write the
 * audit trail (whose chain still verifies), and client-level access limits
 * what a member may do.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuth } from "@dueproof/auth";
import { clients, createDatabase, type Database, migrate, uuidv7 } from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { LocalDiskStorage } from "@dueproof/storage";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  finishSetup,
  saveHolidays,
  saveLanguages,
  saveOrganisation,
  saveProfiles,
  setPreferences,
  updateProfile,
  uploadReportLogo,
} from "../app/actions/settings";
import { loadAuditPage, verifyAuditChain } from "../app/actions/system";
import {
  cancelInvitation,
  changeMemberRole,
  inviteMembers,
  removeMember,
  sendMemberPasswordReset,
  setMemberApprover,
  setMemberClientAccess,
} from "../app/actions/team";
import { authorize } from "../lib/authorize";
import { parseEnv } from "../lib/env";
import type { MailMessage } from "../lib/mail";
import { activeNavId, MOBILE_NAV, NAV_ITEMS } from "../lib/nav";
import { clientIdsFor, parseOrgMetadata } from "../lib/org-metadata";
import { noFlashScript, readPreferences } from "../lib/preferences";
import {
  type Container,
  createEngine,
  resetPasswordSender,
  setContainer,
} from "../lib/server/container";
import { findInvitationByEmail, getOrg, listMembers } from "../lib/server/directory";
import { safeNext } from "../lib/server/page";
import { getOrganisationFor, sniffLogo } from "../lib/settings";
import { backupStatus, outboundHosts } from "../lib/system";

const APP = "http://localhost:3000";
const request = vi.hoisted(() => ({
  headers: new Headers(),
  cookies: new Map<string, string>(),
}));
vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({
    get: (k: string) => (request.cookies.has(k) ? { value: request.cookies.get(k) } : undefined),
    set: (k: string, v: string) => request.cookies.set(k, v),
  }),
}));

let dir: string;
let database: Database;
let container: Container;
/** What the test mailer "delivered", newest last. */
const outbox: MailMessage[] = [];
const testMailer = {
  send: async (m: MailMessage) => {
    outbox.push(m);
    return { driver: "smtp" as const, delivered: true };
  },
};

async function signUp(email: string, name: string): Promise<string> {
  const res = await container.auth.api.signUpEmail({
    body: { email, name, password: "a-long-test-password" },
    returnHeaders: true,
  });
  return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

function as(cookie: string) {
  request.headers = new Headers({ cookie, origin: APP });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "dueproof-settings-"));
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
      database,
      baseURL: APP,
      secret: env.AUTH_SECRET,
      signupPolicy: "first-user",
      rateLimit: false,
      sendResetPassword: resetPasswordSender(() => container.mailer ?? testMailer),
    }),
    mailer: testMailer,
    storage,
    engineStorage: storage,
    engine: createEngine(env, storage),
    startPipeline: async () => "unused",
  };
  setContainer(container);
});

afterAll(async () => {
  setContainer(undefined);
  await database.close();
  await rm(dir, { recursive: true, force: true });
});

describe("pure helpers", () => {
  it("reads preferences from cookies with safe defaults", () => {
    expect(readPreferences({})).toEqual({
      theme: "light",
      density: "comfortable",
      fromCookie: false,
    });
    expect(readPreferences({ theme: "dark", density: "nonsense" })).toEqual({
      theme: "dark",
      density: "comfortable",
      fromCookie: true,
    });
    expect(noFlashScript()).toContain('"system"');
  });

  it("parses organisation metadata defensively", () => {
    expect(parseOrgMetadata(null).profiles).toEqual(["gst", "income_tax", "tds"]);
    expect(parseOrgMetadata("{not json").clientAccess).toEqual({});
    const m = parseOrgMetadata(
      JSON.stringify({ profiles: ["gst", "bogus"], clientAccess: { u1: ["c1", 3] } }),
    );
    expect(m.profiles).toEqual(["gst"]);
    expect(clientIdsFor(m, "u1")).toEqual(["c1"]);
    expect(clientIdsFor(m, "u2")).toBeUndefined();
  });

  it("follows only same-site paths after sign-in", () => {
    expect(safeNext("/settings/team")).toBe("/settings/team");
    expect(safeNext("//evil.example")).toBe("/today");
    expect(safeNext("https://evil.example")).toBe("/today");
    expect(safeNext("/\\evil.example")).toBe("/today");
    expect(safeNext(undefined)).toBe("/today");
  });

  it("finds the active nav item by the longest matching path", () => {
    expect(activeNavId("/settings/team")).toBe("settings");
    expect(activeNavId("/notices/abc")).toBe("notices");
    expect(activeNavId("/")).toBeUndefined();
  });

  it("has a page for every navigation item (no dead links)", () => {
    const appDir = join(__dirname, "..", "app", "(app)");
    for (const item of [...NAV_ITEMS, ...MOBILE_NAV.filter((m) => m.href)]) {
      expect(existsSync(join(appDir, item.href ?? "", "page.tsx")), item.href).toBe(true);
    }
  });

  it("recognises logos by their bytes", () => {
    expect(sniffLogo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      "png",
    );
    expect(sniffLogo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffLogo(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("lists every outbound host from the configuration", () => {
    const env = parseEnv({
      AUTH_SECRET: "x".repeat(40),
      ENGINE_URL: "http://engine:8000",
      ENGINE_SHARED_SECRET: "y".repeat(40),
    });
    expect(outboundHosts(env, null)).toEqual([
      { host: "engine:8000", purpose: "Reading engine (OCR, translation, rules)" },
    ]);
    expect(
      outboundHosts(env, { mode: "byok", provider: "anthropic", baseUrl: null }).map((h) => h.host),
    ).toContain("api.anthropic.com");
    expect(outboundHosts(env, { mode: "off", provider: "anthropic", baseUrl: null })).toHaveLength(
      1,
    );
  });

  it("reports backup status from the backup container's file", async () => {
    const env = parseEnv({ AUTH_SECRET: "x".repeat(40) });
    expect(await backupStatus(env)).toEqual({ state: "unknown" });
    const file = join(dir, "last.json");
    await (await import("node:fs/promises")).writeFile(
      file,
      JSON.stringify({ status: "ok", name: "n1", at: "2026-11-15T02:30:00Z", message: "" }),
    );
    const s = await backupStatus(
      { ...env, BACKUP_STATUS_FILE: file },
      new Date("2026-11-16T00:00:00Z"),
    );
    expect(s).toMatchObject({ state: "ok", name: "n1", stale: false });
    const old = await backupStatus(
      { ...env, BACKUP_STATUS_FILE: file },
      new Date("2026-11-20T00:00:00Z"),
    );
    expect(old.stale).toBe(true);
  });
});

describe("settings and team", () => {
  let owner: string;
  let ownerId: string;
  let orgId: string;

  it("the owner sets up the organisation", async () => {
    owner = await signUp("priya@mehtaiyer.test", "Priya Sharma");
    as(owner);
    const ctx = await authorize("org.manage_settings");
    ownerId = ctx.userId;
    orgId = ctx.orgId;

    const org = await saveOrganisation({
      name: "Mehta Iyer & Associates",
      timezone: "Asia/Kolkata",
      fiscalYearStartMonth: 4,
      workingDays: [6, 1, 2, 3, 4, 5, 5],
      escalationDays: { manager: 1, partner: 3 },
    });
    expect(org).toMatchObject({ ok: true });
    if (org.ok) {
      expect(org.data.name).toBe("Mehta Iyer & Associates");
      expect(org.data.workingDays).toEqual([1, 2, 3, 4, 5, 6]);
    }
    expect(await saveOrganisation({ escalationDays: { manager: 5, partner: 2 } })).toMatchObject({
      ok: false,
      error: "bad_request",
    });
    expect(await saveOrganisation({ name: "x", unknown: 1 })).toMatchObject({ ok: false });

    const hol = await saveHolidays([
      { day: "2026-01-26", name: "Republic Day" },
      { day: "2026-08-15", name: "Independence Day" },
      { day: "2026-01-26", name: "Republic Day (dup)" },
    ]);
    expect(hol).toMatchObject({ ok: true });
    if (hol.ok) expect(hol.data).toHaveLength(2);
    expect(await saveHolidays([{ day: "2026-02-30", name: "Nope" }])).toMatchObject({ ok: false });

    expect(await saveProfiles(["gst", "roc"])).toMatchObject({ ok: true, data: ["gst", "roc"] });
    expect(await saveProfiles(["bogus"])).toMatchObject({ ok: false });
    expect(await saveLanguages(["ml", "ta"])).toMatchObject({ ok: true, data: ["ml", "ta"] });
    expect(await saveLanguages(["ml", "klingon"])).toMatchObject({ ok: false });
    expect(await finishSetup("completed")).toMatchObject({ ok: true });

    const view = await getOrganisationFor(ctx);
    expect(view.holidays.map((h) => h.day)).toEqual(["2026-01-26", "2026-08-15"]);
    expect(view.profiles).toEqual(["gst", "roc"]);
    expect(view.languages).toEqual(["ml", "ta"]);
    expect(view.onboarding.completedAt).toBeTruthy();
  });

  it("stores a PNG report logo and refuses anything else", async () => {
    as(owner);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const form = new FormData();
    form.set("logo", new Blob([png], { type: "image/png" }));
    expect(await uploadReportLogo(form)).toMatchObject({ ok: true, data: { hasReportLogo: true } });
    const bad = new FormData();
    bad.set("logo", new Blob(["<svg/>"], { type: "image/svg+xml" }));
    expect(await uploadReportLogo(bad)).toMatchObject({ ok: false });
  });

  it("sets the profile name and display preferences", async () => {
    as(owner);
    expect(await updateProfile({ name: "  Priya S.  " })).toMatchObject({
      ok: true,
      data: { name: "Priya S." },
    });
    expect(await updateProfile({ name: " " })).toMatchObject({ ok: false });
    expect(await setPreferences({ theme: "dark", density: "compact" })).toMatchObject({ ok: true });
    expect(request.cookies.get("dp-theme")).toBe("dark");
    expect(await setPreferences({ theme: "pink" as never })).toMatchObject({ ok: false });
  });

  let rahul: string;

  it("invites people, who join with the invited role", async () => {
    as(owner);
    const res = await inviteMembers({
      emails: ["Rahul@MehtaIyer.test", "ananya@mehtaiyer.test", "priya@mehtaiyer.test"],
      role: "member",
    });
    expect(res).toMatchObject({ ok: true });
    if (!res.ok) return;
    expect(res.data.invited.map((i) => i.email)).toEqual([
      "rahul@mehtaiyer.test",
      "ananya@mehtaiyer.test",
    ]);
    expect(res.data.skipped).toEqual(["priya@mehtaiyer.test"]);
    // Each invitee is emailed the same working link the admin can copy.
    const link = `${APP}/sign-up?email=rahul%40mehtaiyer.test`;
    expect(res.data.invited[0]).toMatchObject({ link, emailed: true });
    const mail = outbox.find((m) => m.to === "rahul@mehtaiyer.test");
    expect(mail?.subject).toBe("Join Mehta Iyer & Associates on Dueproof");
    expect(mail?.text).toContain(link);
    expect(mail?.html).toContain(link);
    expect(mail?.html).toContain("Mehta Iyer &amp; Associates");
    expect(await findInvitationByEmail(database, "rahul@mehtaiyer.test")).toMatchObject({
      orgName: "Mehta Iyer & Associates",
      role: "member",
    });
    // Cancel Ananya's; she can no longer sign up.
    const ananya = res.data.invited[1];
    if (ananya) expect(await cancelInvitation(ananya.id)).toMatchObject({ ok: true });
    await expect(signUp("ananya@mehtaiyer.test", "Ananya")).rejects.toBeTruthy();

    rahul = await signUp("rahul@mehtaiyer.test", "Rahul");
    as(rahul);
    const ctx = await authorize("case.view");
    expect(ctx.orgId).toBe(orgId);
    expect(ctx.role).toBe("member");
    // A member can't manage the team or see the audit trail.
    expect(await inviteMembers({ emails: ["x@y.test"], role: "member" })).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    expect(await verifyAuditChain()).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("changes roles and approvers within the owner and self rules", async () => {
    as(owner);
    const members = await listMembers(database, orgId);
    const me = members.find((m) => m.userId === ownerId);
    const r = members.find((m) => m.email === "rahul@mehtaiyer.test");
    if (!me || !r) throw new Error("members missing");

    expect(await changeMemberRole(me.memberId, "admin")).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    expect(await removeMember(me.memberId)).toMatchObject({ ok: false, error: "forbidden" });
    expect(await changeMemberRole(r.memberId, "manager")).toMatchObject({ ok: true });
    expect(await setMemberApprover(r.memberId, true)).toMatchObject({
      ok: true,
      data: { mayApproveReplies: true },
    });
    // Becoming a viewer withdraws approval, and a viewer can't be made an approver.
    expect(await changeMemberRole(r.memberId, "viewer")).toMatchObject({
      ok: true,
      data: { role: "viewer", mayApproveReplies: false },
    });
    expect(await setMemberApprover(r.memberId, true)).toMatchObject({ ok: false });
    expect(await changeMemberRole(r.memberId, "admin")).toMatchObject({ ok: true });

    // An admin can't touch the owner or make owners.
    as(rahul);
    expect(await changeMemberRole(me.memberId, "member")).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    expect(await removeMember(me.memberId)).toMatchObject({ ok: false, error: "forbidden" });
    expect(await inviteMembers({ emails: ["boss@x.test"], role: "owner" })).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    as(owner);
    expect(await changeMemberRole(r.memberId, "member")).toMatchObject({ ok: true });
  });

  it("limits a member to chosen clients", async () => {
    const raw = unsafeRawDb(database);
    const allowed = uuidv7();
    const other = uuidv7();
    await raw.insert(clients).values([
      { id: allowed, orgId, name: "Harbour Traders" },
      { id: other, orgId, name: "Northline Foods" },
    ]);
    as(owner);
    const r = (await listMembers(database, orgId)).find((m) => m.email === "rahul@mehtaiyer.test");
    if (!r) throw new Error("rahul missing");
    expect(await setMemberClientAccess(r.memberId, [allowed, "not-a-client"])).toMatchObject({
      ok: true,
      data: { clientIds: [allowed] },
    });
    expect((await getOrg(database, orgId))?.metadata.clientAccess[r.userId]).toEqual([allowed]);

    as(rahul);
    await expect(
      authorize("client.view", { resource: { clientId: allowed } }),
    ).resolves.toBeTruthy();
    await expect(authorize("client.view", { resource: { clientId: other } })).rejects.toMatchObject(
      {
        status: 403,
      },
    );

    as(owner);
    expect(await setMemberClientAccess(r.memberId, null)).toMatchObject({ ok: true });
    as(rahul);
    await expect(authorize("client.view", { resource: { clientId: other } })).resolves.toBeTruthy();
  });

  it("emails a member a password reset link, within the owner and self rules", async () => {
    as(owner);
    const members = await listMembers(database, orgId);
    const me = members.find((m) => m.userId === ownerId);
    const r = members.find((m) => m.email === "rahul@mehtaiyer.test");
    if (!me || !r) throw new Error("members missing");
    // Your own reset goes through the sign-in page.
    expect(await sendMemberPasswordReset(me.memberId)).toMatchObject({ ok: false });
    // A member can't send anyone a link.
    as(rahul);
    expect(await sendMemberPasswordReset(me.memberId)).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    // Without a mail server nothing would arrive, so it's refused.
    as(owner);
    delete container.mailer;
    expect(await sendMemberPasswordReset(r.memberId)).toMatchObject({ ok: false });
    container.mailer = testMailer;

    const before = outbox.length;
    expect(await sendMemberPasswordReset(r.memberId)).toMatchObject({ ok: true });
    const mail = outbox.slice(before).find((m) => m.to === "rahul@mehtaiyer.test");
    expect(mail?.subject).toBe("Reset your Dueproof password");
    const url = mail?.text.match(/https?:\/\/\S+\/api\/auth\/reset-password\/\S+/)?.[0];
    expect(url).toBeTruthy();
    const token = new URL(url ?? "").pathname.split("/").pop() ?? "";
    await container.auth.api.resetPassword({
      body: { token, newPassword: "rahul's brand new password" },
    });
    const signedIn = await container.auth.api.signInEmail({
      body: { email: "rahul@mehtaiyer.test", password: "rahul's brand new password" },
      returnHeaders: true,
    });
    // The reset signed out his other sessions; carry on with the new one.
    rahul = (signedIn.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    as(rahul);
    await expect(authorize("case.view")).resolves.toBeTruthy();
  });

  it("removes a member, who loses access at once", async () => {
    as(owner);
    const r = (await listMembers(database, orgId)).find((m) => m.email === "rahul@mehtaiyer.test");
    if (!r) throw new Error("rahul missing");
    expect(await removeMember(r.memberId)).toMatchObject({ ok: true });
    as(rahul);
    await expect(authorize("case.view")).rejects.toMatchObject({ status: 403 });
  });

  it("audits every change, and the chain verifies", async () => {
    as(owner);
    const page = await loadAuditPage(0);
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    const actions = page.data.map((r) => r.action);
    for (const a of [
      "org.settings.update",
      "org.holidays.replace",
      "org.logo.set",
      "org.profiles.update",
      "org.languages.update",
      "org.setup.completed",
      "user.update",
      "invitation.create",
      "invitation.cancel",
      "member.join",
      "member.role.change",
      "member.approver.change",
      "member.client_access.change",
      "member.password_reset.send",
      "member.remove",
    ])
      expect(actions).toContain(a);
    // No secret values in detail: logos record a size, not bytes.
    expect(JSON.stringify(page.data)).not.toContain("a-long-test-password");
    // Nor reset links.
    expect(JSON.stringify(page.data)).not.toContain("reset-password/");
    const v = await verifyAuditChain();
    expect(v).toMatchObject({ ok: true, data: { ok: true } });
  });
});
