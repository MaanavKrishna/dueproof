/**
 * Deadlines, Clients, Reports, Web Push and the daily job, in-process on
 * PGlite with Better Auth and the fake engine: the server actions and
 * loaders behind each screen, the iCal and CSV routes, and the cron route.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuth, inviteToken } from "@dueproof/auth";
import { gstinCheckCharacter } from "@dueproof/core";
import {
  cases,
  createDatabase,
  type Database,
  documents,
  eq,
  invitation,
  migrate,
  notifications,
  pushSubscriptions,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { handleLocalStorageRequest, LocalDiskStorage } from "@dueproof/storage";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  listNotifications,
  markNotificationsRead,
  newNotifications,
} from "../app/actions/notifications";
import { GET as cronRoute } from "../app/api/cron/daily/route";
import { GET as feedRoute } from "../app/api/v1/calendar/[token]/route";
import { GET as reportRoute } from "../app/api/v1/reports/[name]/route";
import {
  createClient,
  importClients,
  mergeClients,
  recordDemand,
  saveContact,
  saveRegistration,
} from "../features/clients/actions";
import { guessMapping } from "../features/clients/csv-import";
import { findDuplicates, getClientPage, listClients } from "../features/clients/queries";
import {
  addManualDeadline,
  createCalendarFeed,
  markDeadlineDone,
  reassignDeadline,
  restoreDeadline,
  revokeCalendarFeeds,
  snoozeDeadline,
} from "../features/deadlines/actions";
import { loadDeadlinesPage } from "../features/deadlines/queries";
import { subscribePush, unsubscribePush } from "../features/push/actions";
import { runDaily } from "../features/reminders/daily";
import {
  loadClientStatement,
  loadEvidenceReport,
  loadExposureReport,
  loadWorkload,
} from "../features/reports/queries";
import { type AuthContext, authorize } from "../lib/authorize";
import { parseEnv } from "../lib/env";
import type { MailMessage } from "../lib/mail";
import { sendPushToUser, setPushTransport } from "../lib/push";
import { type Container, createEngine, setContainer } from "../lib/server/container";
import { listMembers } from "../lib/server/directory";
import { setClientAccessFor } from "../lib/team";
import { completeUpload, initUpload } from "../lib/upload";
import { processDocument } from "../workflows/process-document";

const APP = "http://localhost:3000";
const FIXTURE = new URL(
  "../../../services/engine/tests/fixtures/notice-gst-asmt10.pdf",
  import.meta.url,
);
const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

const gstin = (first14: string) => `${first14}${gstinCheckCharacter(first14)}`;
const GSTIN = gstin("27AAACH1234A1Z");

let dir: string;
let database: Database;
let container: Container;
let owner: AuthContext;
let ownerCookie: string;
let memberId: string;
let memberCookie: string;

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
const as = (cookie: string) => {
  request.headers = new Headers({ cookie, origin: APP });
};
function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(`action failed: ${r.message}`);
  return r.data;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "dueproof-s3-"));
  const env = parseEnv({
    NODE_ENV: "test",
    APP_URL: APP,
    AUTH_SECRET: "test-auth-secret-test-auth-secret-0123456789",
    STORAGE_LOCAL_DIR: dir,
    CRON_SECRET: "cron-secret-cron-secret-cron-secret-0123",
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
      signupPolicy: "open",
      rateLimit: false,
    }),
    storage,
    engineStorage: storage,
    engine: createEngine(env, storage),
    startPipeline: async (ref) => {
      await processDocument(ref);
      return `inline-${ref.documentId}`;
    },
  };
  setContainer(container);
  ownerCookie = await signUp("asha@harbour.test", "Asha Rao");
  owner = await authorize("case.view", { headers: new Headers({ cookie: ownerCookie }) });
  const invitationId = uuidv7();
  await unsafeRawDb(database)
    .insert(invitation)
    .values({
      id: invitationId,
      organizationId: owner.orgId,
      email: "ravi@harbour.test",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: owner.userId,
    });
  memberCookie = await signUp("ravi@harbour.test", "Ravi Iyer", invitationId);
  memberId = (await authorize("case.view", { headers: new Headers({ cookie: memberCookie }) }))
    .userId;
});

afterAll(async () => {
  setPushTransport(undefined);
  setContainer(undefined);
  await database.close();
  await rm(dir, { recursive: true, force: true });
});

let clientId: string;

describe("clients", () => {
  it("creates a client, refusing a bad GSTIN", async () => {
    as(ownerCookie);
    const bad = await createClient({
      name: "Harbour Valley Foods",
      gstins: [`${GSTIN.slice(0, 14)}0`],
    });
    expect(bad).toMatchObject({ ok: false, error: "invalid_identifier" });
    clientId = ok(
      await createClient({
        name: "Harbour Valley Foods",
        gstins: [GSTIN],
        tags: ["Key client"],
        partnerUserId: owner.userId,
      }),
    ).id;
    // A member may not create clients.
    as(memberCookie);
    expect(await createClient({ name: "Nope" })).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("GST (monthly) and TDS registrations build the statutory calendar", async () => {
    as(ownerCookie);
    const gst = ok(
      await saveRegistration(clientId, { kind: "gst", identifier: GSTIN, frequency: "monthly" }),
    );
    expect(gst.inserted).toBeGreaterThan(10);
    const tds = ok(
      await saveRegistration(clientId, {
        kind: "tds",
        identifier: "MUMH12345B",
        frequency: "quarterly",
        attributes: { files24Q: false },
      }),
    );
    expect(tds.inserted).toBeGreaterThan(5);
    expect(await saveRegistration(clientId, { kind: "tds", identifier: "BAD" })).toMatchObject({
      ok: false,
      error: "invalid_identifier",
    });

    const page = await getClientPage(owner, clientId);
    expect(page.registrations.map((r) => r.kind).sort()).toEqual(["gst", "tds"]);
    const forms = new Set(page.deadlines.map((d) => d.statutory?.form));
    expect(forms).toContain("GSTR-3B");
    expect(forms).toContain("GSTR-1");
    expect([...forms].some((f) => f?.includes("26Q"))).toBe(true);
    expect([...forms].some((f) => f?.includes("24Q"))).toBe(false);

    const deadlines = await loadDeadlinesPage(owner);
    const statutory = deadlines.rows.filter((r) => r.source === "statutory");
    expect(statutory.length).toBeGreaterThan(15);
    expect(statutory[0]).toMatchObject({
      clientName: "Harbour Valley Foods",
      type: expect.stringMatching(/gst|tds/),
    });
    expect(statutory.every((r) => r.basis.length > 0 && r.statutory?.verified === false)).toBe(
      true,
    );
  });

  it("saves a contact with a WhatsApp number in E.164", async () => {
    as(ownerCookie);
    ok(
      await saveContact(clientId, {
        name: "Meera",
        whatsapp: "98765 43210",
        email: "meera@harbour.test",
      }),
    );
    expect(await saveContact(clientId, { name: "X", phone: "123" })).toMatchObject({ ok: false });
    const page = await getClientPage(owner, clientId);
    expect(page.contacts[0]).toMatchObject({ name: "Meera", whatsapp: "+919876543210" });
  });

  it("imports a CSV, reporting rows with a bad GSTIN, and merges a duplicate", async () => {
    as(ownerCookie);
    const other = gstin("29AAJFK3456Q1Z");
    const csv = [
      "Party Name,GSTIN/UIN,PAN,Filing frequency,Mobile",
      `Kaveri Agro,${other},,quarterly,9876500000`,
      `Broken Co,${other.slice(0, 14)}0,,,`,
      `Harbour Valley Foods (old),${GSTIN},,,`,
    ].join("\n");
    const res = ok(await importClients(csv, guessMapping(csv.split("\n")[0]?.split(",") ?? [])));
    expect(res).toMatchObject({ created: 1, existing: 1, skipped: 1 });
    expect(res.issues[0]).toMatchObject({ line: 3, field: "gstin" });
    expect(res.statutory).toBeGreaterThan(0);

    const dupeId = ok(await createClient({ name: "HVF duplicate", pan: "AAACH1234A" }));
    const dupes = await findDuplicates(owner);
    expect(dupes.some((d) => d.key === "PAN AAACH1234A" && d.clients.length === 2)).toBe(true);
    ok(await mergeClients(clientId, dupeId.id));
    const list = await listClients(owner);
    expect(list.rows.map((r) => r.name).sort()).toEqual(["Harbour Valley Foods", "Kaveri Agro"]);
    expect(list.rows.find((r) => r.id === clientId)?.openItems).toBeGreaterThan(0);
  });
});

describe("deadlines", () => {
  let manualId: string;
  it("adds a deadline by hand with a computed basis", async () => {
    as(memberCookie);
    expect(await addManualDeadline({ title: "", dueOn: "2026-12-01" })).toMatchObject({
      ok: false,
    });
    manualId = ok(
      await addManualDeadline({
        title: "Call the range officer",
        dueOn: "2026-12-01",
        clientId,
        note: "Agreed by phone",
      }),
    ).id;
    const page = await loadDeadlinesPage(owner);
    const row = page.rows.find((r) => r.id === manualId);
    expect(row).toMatchObject({ source: "manual", dueOn: "2026-12-01", clientId, status: "open" });
    expect(row?.basis).toContain("Agreed by phone");
  });

  it("marks done and undoes, snoozes, and reassigns with a notification", async () => {
    as(memberCookie);
    const prev = ok(await markDeadlineDone(manualId, "ARN-123"));
    expect(prev.status).toBe("open");
    let row = (await loadDeadlinesPage(owner)).rows.find((r) => r.id === manualId);
    expect(row).toMatchObject({ status: "done", state: "done", ackNumber: "ARN-123" });
    ok(await restoreDeadline(prev));
    row = (await loadDeadlinesPage(owner)).rows.find((r) => r.id === manualId);
    expect(row?.status).toBe("open");

    ok(await snoozeDeadline(manualId, "2099-01-01"));
    row = (await loadDeadlinesPage(owner)).rows.find((r) => r.id === manualId);
    expect(row?.snoozedUntil).toBe("2099-01-01");
    expect(await snoozeDeadline(manualId, "not-a-date")).toMatchObject({ ok: false });
    ok(await snoozeDeadline(manualId, null));

    expect(await reassignDeadline(manualId, "someone-else")).toMatchObject({ ok: false });
    ok(await reassignDeadline(manualId, owner.userId));
    const notes = await withOrg(database, owner.orgId, (tx) => tx.select().from(notifications));
    expect(
      notes.find((n) => n.userId === owner.userId && n.kind === "deadline.assigned"),
    ).toBeTruthy();

    // The desktop app's OS alerts: the owner's new ones, with the generic line only.
    as(ownerCookie);
    const alerts = ok(await newNotifications("2000-01-01T00:00:00Z"));
    expect(alerts.find((a) => a.title === "Something was assigned to you")).toMatchObject({
      href: expect.stringMatching(/^\//),
    });
    expect(JSON.stringify(alerts)).not.toContain("Call the range officer");
    expect(ok(await newNotifications(new Date(Date.now() + 60_000).toISOString()))).toEqual([]);
    expect(await newNotifications("yesterday")).toMatchObject({ ok: false });

    // The bell: the owner's own notifications, newest first, with the in-app title.
    const bell = ok(await listNotifications());
    const assigned = bell.find((n) => n.kind === "deadline.assigned");
    expect(assigned).toMatchObject({ read: false, href: expect.stringMatching(/^\//) });
    expect(bell.every((n) => notes.some((x) => x.id === n.id && x.userId === owner.userId))).toBe(
      true,
    );
    expect(ok(await markNotificationsRead([assigned?.id ?? ""]))).toEqual({ marked: 1 });
    expect(ok(await listNotifications()).find((n) => n.id === assigned?.id)?.read).toBe(true);
    expect(await markNotificationsRead("all" as never)).toMatchObject({ ok: false });

    // A viewer-like outsider org can't touch it.
    const outsider = await signUp("nina@northline.test", "Nina");
    as(outsider);
    expect(await markDeadlineDone(manualId)).toMatchObject({ ok: false, error: "not_found" });
    // Nor see or clear the owner's notifications.
    expect(ok(await listNotifications())).toEqual([]);
    expect(ok(await markNotificationsRead([assigned?.id ?? ""]))).toEqual({ marked: 0 });
    expect(ok(await markNotificationsRead(null))).toEqual({ marked: 0 });
    as(ownerCookie);
    const left = ok(await listNotifications()).filter((n) => !n.read).length;
    expect(ok(await markNotificationsRead(null))).toEqual({ marked: left });
    expect(ok(await listNotifications()).every((n) => n.read)).toBe(true);
  });

  it("serves a signed iCal feed and stops it when revoked", async () => {
    as(ownerCookie);
    const { url } = ok(await createCalendarFeed("me"));
    const token = url.split("/").pop() as string;
    const call = (t: string) =>
      feedRoute(new Request(`${APP}/api/v1/calendar/${t}`), {
        params: Promise.resolve({ token: t }),
      });
    const res = await call(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const ics = await res.text();
    expect(ics).toContain("SUMMARY:Call the range officer");
    expect(ics).not.toContain("Harbour Valley Foods");
    const org = ok(await createCalendarFeed("org"));
    expect(await (await call(org.url.split("/").pop() as string)).text()).toContain("GSTR-3B");
    expect((await call(`${token.slice(0, -6)}AAAAAA`)).status).toBe(404);
    await new Promise((r) => setTimeout(r, 5));
    ok(await revokeCalendarFeeds());
    expect((await call(token)).status).toBe(410);
    const fresh = ok(await createCalendarFeed("me"));
    await new Promise((r) => setTimeout(r, 5));
    expect((await call(fresh.url.split("/").pop() as string)).status).toBe(200);
  });

  it("exports the filtered list as CSV", async () => {
    request.headers = new Headers({ cookie: ownerCookie });
    const res = await reportRoute(
      new Request(`${APP}/api/v1/reports/deadlines.csv?source=manual`, {
        headers: { cookie: ownerCookie },
      }),
      {
        params: Promise.resolve({ name: "deadlines.csv" }),
      },
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.split("\r\n")[1]).toContain("Call the range officer");
    expect(text).not.toContain("GSTR-3B");
  });
});

describe("reports and exposure", () => {
  let caseId: string;
  it("records a demand and shows interest with its workings", async () => {
    caseId = uuidv7();
    await withOrg(database, owner.orgId, (tx) =>
      tx.insert(cases).values({
        id: caseId,
        orgId: owner.orgId,
        clientId,
        title: "ASMT-10 · FY 2025-26",
        reference: "ZD2710260012345",
        stage: "approval",
      }),
    );
    as(memberCookie);
    ok(
      await recordDemand(clientId, {
        caseId,
        taxType: "gst",
        head: "tax",
        principalMinor: 45_230_000,
        interestRule: "in.gst.s50.1",
        dueOn: "2026-05-20",
        penaltyRule: "in.gst.s73",
      }),
    );
    expect(
      await recordDemand(clientId, {
        caseId,
        taxType: "gst",
        head: "tax",
        principalMinor: 1,
        interestRule: "made.up",
      }),
    ).toMatchObject({ ok: false });
    // Members don't see exposure; the client page leaves it out.
    const memberCtx = await authorize("case.view", {
      headers: new Headers({ cookie: memberCookie }),
    });
    expect((await getClientPage(memberCtx, clientId)).exposure).toBeNull();
    const page = await getClientPage(owner, clientId);
    const t = page.exposure?.exposure.clients[clientId];
    expect(t?.openMinor).toBe(45_230_000);
    expect(t?.computedInterestMinor).toBeGreaterThan(0);
    expect(t?.penaltyHighMinor).toBeGreaterThanOrEqual(t?.penaltyLowMinor ?? 0);
    expect(page.exposure?.workings[0]?.steps.length).toBeGreaterThan(1);
    const report = await loadExposureReport(owner);
    expect(report.view.exposure.firm.openMinor).toBe(45_230_000);
  });

  it("builds the evidence report for an uploaded ASMT-10, with page crops and audit", async () => {
    const pdf = new Uint8Array(await readFile(FIXTURE));
    const sha256 = createHash("sha256").update(pdf).digest("hex");
    const init = await initUpload(owner, {
      filename: "asmt10.pdf",
      size: pdf.byteLength,
      mime: "application/pdf",
      sha256,
      receivedOn: "2026-10-24",
    });
    if (init.status !== "upload") throw new Error("expected an upload");
    const put = await handleLocalStorageRequest(
      container.storage as LocalDiskStorage,
      new Request(init.upload.url, {
        method: "PUT",
        headers: init.upload.headers,
        body: pdf as BodyInit,
      }),
    );
    expect(put.status).toBe(200);
    await completeUpload(owner, init.documentId);
    await withOrg(database, owner.orgId, (tx) =>
      tx.update(documents).set({ caseId, clientId }).where(eq(documents.id, init.documentId)),
    );
    const report = await loadEvidenceReport(owner, { caseId });
    expect(report.scope).toContain("ASMT-10");
    expect(report.items.length).toBeGreaterThanOrEqual(4);
    const located = report.items.filter((i) => i.proof);
    expect(located.length).toBeGreaterThan(0);
    expect(located[0]?.proof?.rects.length).toBeGreaterThan(0);
    expect(report.items.some((i) => i.deadlines.length)).toBe(true);
    expect(report.audit.length).toBeGreaterThan(0);
    const range = await loadEvidenceReport(owner, { range: "2026-10-01..2026-10-31" });
    expect(range.items.length).toBe(report.items.length);
    await expect(loadEvidenceReport(owner, {})).rejects.toMatchObject({ status: 400 });
    await expect(
      loadEvidenceReport(owner, { range: "2026-12-01..2026-01-01" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("builds the client statement and workload", async () => {
    const st = await loadClientStatement(owner, clientId);
    expect(st.cases.map((c) => c.id)).toContain(caseId);
    expect(st.deadlines.every((d) => d.status === "open" && d.clientId === clientId)).toBe(true);
    const w = await loadWorkload(owner);
    expect(w.weeks).toHaveLength(8);
    expect(w.rows.find((r) => r.userId === null)?.total).toBeGreaterThan(0);
    expect(w.rows.find((r) => r.userId === owner.userId)?.total).toBe(1);
  });
});

describe("web push and the daily job", () => {
  const sub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/device-1",
    keys: {
      p256dh:
        "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
      auth: "tBHItJI5svbpez7KI4CCXg",
    },
  };

  it("subscribes, sends a generic payload, and drops a gone endpoint", async () => {
    as(ownerCookie);
    ok(await subscribePush(sub));
    ok(await subscribePush(sub)); // re-subscribing replaces, never duplicates
    expect(await subscribePush({ endpoint: "http://insecure/x", keys: sub.keys })).toMatchObject({
      ok: false,
    });
    const sent: string[] = [];
    setPushTransport(async (_s, payload) => {
      sent.push(payload);
      return 201;
    });
    expect(
      await sendPushToUser(container, owner.orgId, owner.userId, {
        title: "A deadline needs attention",
        url: "/deadlines",
      }),
    ).toMatchObject({ sent: 1 });
    expect(JSON.parse(sent[0] ?? "{}")).toEqual({
      title: "A deadline needs attention",
      body: "",
      url: "/deadlines",
      tag: "dueproof",
    });
    setPushTransport(async () => 410);
    expect(
      await sendPushToUser(container, owner.orgId, owner.userId, { title: "x", url: "/" }),
    ).toMatchObject({ removed: 1 });
    const left = await withOrg(database, owner.orgId, (tx) => tx.select().from(pushSubscriptions));
    expect(left).toHaveLength(0);
    setPushTransport(async () => 201);
    ok(await subscribePush(sub));
    expect(ok(await unsubscribePush(sub.endpoint)).removed).toBe(1);
  });

  it("notifies, escalates and sends the morning digest once a day", async () => {
    as(ownerCookie);
    const lateId = ok(
      await addManualDeadline({
        title: "Overdue reply",
        dueOn: "2026-11-01",
        clientId,
        ownerUserId: memberId,
      }),
    ).id;
    const outbox: MailMessage[] = [];
    const mailer = {
      send: async (m: MailMessage) => {
        outbox.push(m);
        return { driver: "smtp" as const, delivered: true };
      },
    };
    const first = await runDaily(container, { today: "2026-11-16", mailer });
    expect(first.digests).toBeGreaterThanOrEqual(2);
    expect(first.escalations).toBeGreaterThanOrEqual(2); // manager (admin/owner here) and partner
    const toRavi = outbox.find((m) => m.to === "ravi@harbour.test");
    expect(toRavi?.subject).toMatch(/overdue/);
    expect(toRavi?.html).toContain("Overdue reply");
    expect(outbox.find((m) => m.to === "asha@harbour.test")?.text).toContain(
      "Awaiting your approval",
    );
    const notes = await withOrg(database, owner.orgId, (tx) => tx.select().from(notifications));
    expect(notes.some((n) => n.userId === memberId && n.kind === "deadline.overdue")).toBe(true);
    expect(
      notes.some(
        (n) =>
          n.userId === owner.userId &&
          n.kind === "deadline.escalated" &&
          (n.payload as { deadlineId?: string }).deadlineId === lateId,
      ),
    ).toBe(true);

    const again = await runDaily(container, { today: "2026-11-16", mailer });
    expect(again).toMatchObject({ digests: 0, escalations: 0, notifications: 0 });
  });

  it("doesn't mark digests sent when the log driver only recorded them", async () => {
    const recorded: MailMessage[] = [];
    const logOnly = {
      send: async (m: MailMessage) => {
        recorded.push(m);
        return { driver: "log" as const, delivered: false };
      },
    };
    const dry = await runDaily(container, { today: "2026-11-17", mailer: logOnly });
    expect(recorded.length).toBeGreaterThanOrEqual(2);
    expect(dry.digests).toBe(0);
    // Once mail works, the same day's digests still go out.
    const delivered = {
      send: async () => ({ driver: "smtp" as const, delivered: true }),
    };
    const real = await runDaily(container, { today: "2026-11-17", mailer: delivered });
    expect(real.digests).toBe(recorded.length);
  });

  it("protects the cron route with its secret", async () => {
    expect((await cronRoute(new Request(`${APP}/api/cron/daily`))).status).toBe(401);
    expect(
      (
        await cronRoute(
          new Request(`${APP}/api/cron/daily`, { headers: { authorization: "Bearer wrong" } }),
        )
      ).status,
    ).toBe(401);
    const res = await cronRoute(
      new Request(`${APP}/api/cron/daily`, {
        headers: { authorization: `Bearer ${container.env.CRON_SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ orgs: 2 });
  });
});

describe("client-level access", () => {
  it("limits clients, deadlines, reports and the feed to the member's clients", async () => {
    const members = await listMembers(database, owner.orgId);
    const ravi = members.find((m) => m.userId === memberId);
    const kaveri = (await listClients(owner)).rows.find((r) => r.name === "Kaveri Agro");
    if (!ravi || !kaveri) throw new Error("fixtures missing");
    await setClientAccessFor(owner, ravi.memberId, [kaveri.id]);
    const ctx = await authorize("case.view", { headers: new Headers({ cookie: memberCookie }) });
    expect(ctx.clientIds).toEqual([kaveri.id]);

    expect((await listClients(ctx)).rows.map((r) => r.name)).toEqual(["Kaveri Agro"]);
    await expect(getClientPage(ctx, clientId)).rejects.toMatchObject({ status: 404 });
    const page = await loadDeadlinesPage(ctx);
    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.every((r) => r.clientId === null || r.clientId === kaveri.id)).toBe(true);
    expect(page.clients.map((c) => c.name)).toEqual(["Kaveri Agro"]);
    await expect(loadClientStatement(ctx, clientId)).rejects.toMatchObject({ status: 404 });
    await expect(loadEvidenceReport(ctx, { clientId })).rejects.toMatchObject({ status: 404 });

    as(memberCookie);
    const { url } = ok(await createCalendarFeed("org"));
    const token = url.split("/").pop() as string;
    const ics = await (
      await feedRoute(new Request(url), { params: Promise.resolve({ token }) })
    ).text();
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("SUMMARY:Overdue reply"); // Harbour's item
  });
});
