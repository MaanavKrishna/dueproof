/**
 * The received date and what rests on it, in-process on PGlite with the fake
 * engine (review findings H1, H2, H6, M4, M6):
 *
 * - an upload with no received date assumes the upload day and flags every
 *   deadline that counts from it ("received date assumed: confirm");
 * - setting, confirming or correcting the date recomputes the notice's
 *   deadlines and the order's appeal window, with their working, and leaves
 *   dates corrected by hand alone;
 * - deadlines from the pipeline have an owner, and the daily job reminds
 *   someone about unowned and snoozed-but-late items on time;
 * - uploads: a quarantined file can be sent again, two inits or two
 *   completes at once make one document and one pipeline run, and the
 *   database refuses a second deadline for one finding.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuth, inviteToken } from "@dueproof/auth";
import { addDays } from "@dueproof/core";
import {
  and,
  createDatabase,
  type Database,
  deadlines,
  documents,
  eq,
  findingEdits,
  findings,
  invitation,
  isNull,
  migrate,
  notifications,
  schema,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { handleLocalStorageRequest, LocalDiskStorage } from "@dueproof/storage";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setReceivedDate } from "../app/actions/upload";
import { assignCase, correctDueDate, correctReceivedDate } from "../features/cases/actions";
import { loadCase } from "../features/cases/queries";
import { openCase } from "../features/inbox/actions";
import { loadInbox } from "../features/inbox/queries";
import { runDaily } from "../features/reminders/daily";
import { type AuthContext, authorize } from "../lib/authorize";
import type { DeadlineDetail } from "../lib/deadline-detail";
import { parseEnv } from "../lib/env";
import { editFinding } from "../lib/findings";
import type { MailMessage } from "../lib/mail";
import { todayIn } from "../lib/pipeline/status";
import { RECEIVED_ASSUMED_WARNING } from "../lib/received-date";
import { type Container, createEngine, setContainer } from "../lib/server/container";
import { completeUpload, type InitUploadInput, initUpload } from "../lib/upload";
import { processDocument } from "../workflows/process-document";

const FIXTURE = new URL(
  "../../../services/engine/tests/fixtures/notice-gst-asmt10.pdf",
  import.meta.url,
);
const APP = "http://localhost:3000";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

let dir: string;
let database: Database;
let container: Container;
let storage: LocalDiskStorage;
let pdf: Uint8Array;
let sha256: string;
let pipelineRuns = 0;
const TODAY = todayIn("Asia/Kolkata");

async function signUp(
  email: string,
  invitationId?: string,
): Promise<{ headers: Headers; ctx: AuthContext }> {
  const res = await container.auth.api.signUpEmail({
    body: {
      email,
      name: email.split("@")[0] ?? "x",
      password: "a-long-test-password",
      // An invitation's link carries its token (H1).
      ...(invitationId
        ? { inviteToken: inviteToken(container.env.AUTH_SECRET, invitationId) }
        : {}),
    },
    returnHeaders: true,
  });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const headers = new Headers({ cookie, origin: APP });
  request.headers = headers;
  return { headers, ctx: await authorize("document.upload", { headers }) };
}

const as = (h: Headers) => {
  request.headers = h;
};

async function put(url: string, headers: Record<string, string>) {
  const res = await handleLocalStorageRequest(
    storage,
    new Request(url, { method: "PUT", headers, body: pdf as BodyInit }),
  );
  expect(res.status).toBe(200);
}

/** Upload the ASMT-10 notice and run the pipeline inline. */
async function upload(ctx: AuthContext, over: Partial<InitUploadInput> = {}) {
  const init = await initUpload(ctx, {
    filename: "asmt10.pdf",
    size: pdf.byteLength,
    mime: "application/pdf",
    sha256,
    ...over,
  });
  if (init.status !== "upload") throw new Error(`expected an upload, got ${init.status}`);
  await put(init.upload.url, init.upload.headers);
  const done = await completeUpload(ctx, init.documentId);
  return { documentId: init.documentId, done };
}

async function docRow(orgId: string, id: string) {
  const [row] = await withOrg(database, orgId, (tx) =>
    tx.select().from(documents).where(eq(documents.id, id)),
  );
  if (!row) throw new Error("no document");
  return row;
}

/** The document's deadlines from findings, by the finding's kind. */
async function deadlinesOf(orgId: string, documentId: string) {
  const rows = await withOrg(database, orgId, (tx) =>
    tx
      .select({ d: deadlines, kind: findings.kind })
      .from(deadlines)
      .innerJoin(findings, eq(findings.id, deadlines.findingId))
      .where(eq(findings.documentId, documentId)),
  );
  return rows.map(({ d, kind }) => ({ ...d, kind, detail: d.detail as unknown as DeadlineDetail }));
}

/** The reply deadline: "within 30 days of receipt". */
async function replyOf(orgId: string, documentId: string) {
  const ds = await deadlinesOf(orgId, documentId);
  const reply = ds.find((d) => (d.rule as { anchor?: string }).anchor === "receipt");
  if (!reply) throw new Error("no reply deadline");
  return { reply, all: ds };
}

async function orderWindow(orgId: string, caseId: string) {
  const [w] = await withOrg(database, orgId, (tx) =>
    tx
      .select()
      .from(deadlines)
      .where(
        and(
          eq(deadlines.caseId, caseId),
          eq(deadlines.source, "order"),
          isNull(deadlines.findingId),
        ),
      ),
  );
  return w ? { ...w, detail: w.detail as unknown as DeadlineDetail } : undefined;
}

function ok<T>(r: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!r.ok) throw new Error(r.message);
  return r.data;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "dueproof-received-"));
  pdf = new Uint8Array(await readFile(FIXTURE));
  sha256 = createHash("sha256").update(pdf).digest("hex");
  const env = parseEnv({
    NODE_ENV: "test",
    APP_URL: APP,
    AUTH_SECRET: "test-auth-secret-test-auth-secret-0123456789",
    STORAGE_LOCAL_DIR: dir,
  });
  database = await createDatabase({ driver: "pglite" });
  await migrate(database);
  storage = new LocalDiskStorage({
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
      pipelineRuns += 1;
      await processDocument(ref);
      return `inline-${ref.documentId}`;
    },
  };
  setContainer(container);
});

afterAll(async () => {
  setContainer(undefined);
  await database.close();
  await rm(dir, { recursive: true, force: true });
});

describe("H1: a received date nobody gave is flagged, never silent", () => {
  let user: { headers: Headers; ctx: AuthContext };
  let documentId: string;

  beforeAll(async () => {
    user = await signUp("assumed@harbour.test");
    documentId = (await upload(user.ctx)).documentId;
  });

  it("assumes the upload day, and marks the document", async () => {
    const doc = await docRow(user.ctx.orgId, documentId);
    expect(doc.receivedOn).toBe(TODAY);
    expect(doc.receivedOnAssumed).toBe(true);
    // A deadline rests on a guess: the document waits for a person.
    expect(doc.status).toBe("needs_review");
  });

  it("flags the deadline counted from receipt, and only that one", async () => {
    const { reply, all } = await replyOf(user.ctx.orgId, documentId);
    expect(reply.dueOn).toBe(addDays(TODAY, 30));
    expect(reply.detail.warnings).toContain(RECEIVED_ASSUMED_WARNING);
    expect(reply.detail.receivedOnAssumed).toBe(true);
    const fixed = all.filter((d) => d.id !== reply.id);
    expect(fixed.length).toBeGreaterThan(0);
    for (const d of fixed) expect(d.detail.warnings).not.toContain(RECEIVED_ASSUMED_WARNING);
  });

  it("puts 'received date assumed: confirm' in the review queue and on the case", async () => {
    const inbox = await loadInbox(user.ctx);
    const item = inbox.review.find((r) => r.kind === "received_date");
    expect(item).toMatchObject({
      documentId,
      duty: "Received date assumed: confirm",
      received: { iso: TODAY },
    });
    expect(inbox.toFile.find((d) => d.id === documentId)?.receivedAssumed).toBe(true);
  });

  it("is not flagged when the date is given, and refuses a date in the future", async () => {
    const other = await signUp("given@harbour.test");
    const given = addDays(TODAY, -5);
    const { documentId: id } = await upload(other.ctx, { receivedOn: given });
    const doc = await docRow(other.ctx.orgId, id);
    expect(doc).toMatchObject({ receivedOn: given, receivedOnAssumed: false });
    const { reply } = await replyOf(other.ctx.orgId, id);
    expect(reply.dueOn).toBe(addDays(given, 30));
    expect(reply.detail.warnings).not.toContain(RECEIVED_ASSUMED_WARNING);
    expect((await loadInbox(other.ctx)).review.some((r) => r.kind === "received_date")).toBe(false);

    const third = await signUp("future@harbour.test");
    await expect(
      initUpload(third.ctx, {
        filename: "x.pdf",
        size: pdf.byteLength,
        mime: "application/pdf",
        sha256,
        receivedOn: addDays(TODAY, 2),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("H2: setting the real date recomputes the deadline and clears the flag, with history", async () => {
    as(user.headers);
    const real = addDays(TODAY, -10);
    const r = ok(await setReceivedDate({ documentId, receivedOn: real }));
    expect(r.recomputed).toBe(1);
    const doc = await docRow(user.ctx.orgId, documentId);
    expect(doc).toMatchObject({ receivedOn: real, receivedOnAssumed: false });
    const { reply } = await replyOf(user.ctx.orgId, documentId);
    expect(reply.dueOn).toBe(addDays(real, 30));
    expect(reply.basis).toContain("receipt");
    expect(reply.detail.warnings).not.toContain(RECEIVED_ASSUMED_WARNING);
    expect(reply.detail.receivedOnAssumed).toBeUndefined();
    expect(reply.detail.inputs).toMatchObject({ anchorDate: real });
    expect(reply.detail.origin).toBeDefined(); // what isn't the date engine's is kept
    expect((await loadInbox(user.ctx)).review.some((i) => i.kind === "received_date")).toBe(false);
    const trail = await withOrg(database, user.ctx.orgId, (tx) =>
      tx.select().from(schema.audit).where(eq(schema.audit.targetId, documentId)),
    );
    expect(trail.find((a) => a.action === "document.received_date")?.detail).toMatchObject({
      from: TODAY,
      to: real,
      wasAssumed: true,
    });
  });

  it("confirming the assumed date keeps it and clears the flag", async () => {
    const u = await signUp("confirm@harbour.test");
    const { documentId: id } = await upload(u.ctx);
    as(u.headers);
    expect(ok(await setReceivedDate({ documentId: id, receivedOn: TODAY })).recomputed).toBe(1);
    const { reply } = await replyOf(u.ctx.orgId, id);
    expect(reply.dueOn).toBe(addDays(TODAY, 30));
    expect(reply.detail.warnings).not.toContain(RECEIVED_ASSUMED_WARNING);
    expect((await docRow(u.ctx.orgId, id)).receivedOnAssumed).toBe(false);
    // Nothing left to confirm: a second call changes nothing.
    expect(ok(await setReceivedDate({ documentId: id, receivedOn: TODAY })).recomputed).toBe(0);
  });
});

describe("H2 and M4: an order's appeal window moves with the received date; hand corrections stay", () => {
  let user: { headers: Headers; ctx: AuthContext };
  let documentId: string;
  let caseId: string;
  const served = addDays(TODAY, -20);

  beforeAll(async () => {
    user = await signUp("order@harbour.test");
    documentId = (await upload(user.ctx, { role: "order", receivedOn: served })).documentId;
    // A GST order: its appeal (s.107) has a condonation window, a separate date.
    await withOrg(database, user.ctx.orgId, (tx) =>
      tx.update(documents).set({ docType: "GST order" }).where(eq(documents.id, documentId)),
    );
    as(user.headers);
    caseId = ok(await openCase({ documentId, newClientName: "Harbour Valley Foods" })).caseId;
  });

  it("correcting the received date moves the appeal window and its condonation end", async () => {
    const before = await orderWindow(user.ctx.orgId, caseId);
    if (!before) throw new Error("no appeal window");
    expect(before.windowEndOn).not.toBeNull();
    expect(before.detail.inputs).toMatchObject({ anchorDate: served });

    const later = addDays(served, 7);
    const r = ok(
      await correctReceivedDate({ caseId, documentId, receivedOn: later, reason: "Postmark" }),
    );
    expect(r.recomputed).toBeGreaterThanOrEqual(2); // the reply and the appeal window

    const after = await orderWindow(user.ctx.orgId, caseId);
    if (!after) throw new Error("no appeal window after");
    expect(after.dueOn > before.dueOn).toBe(true);
    expect(after.windowEndOn && before.windowEndOn && after.windowEndOn > before.windowEndOn).toBe(
      true,
    );
    expect(after.detail.inputs).toMatchObject({ anchorDate: later });
    const key = (before.detail as DeadlineDetail & { windowKey?: string }).windowKey;
    expect(key).toBe("in.gst.appeal.s107");
    expect(after.detail).toMatchObject({ windowKey: key, documentId });
    const { reply } = await replyOf(user.ctx.orgId, documentId);
    expect(reply.dueOn).toBe(addDays(later, 30));
  });

  it("a due date corrected by hand becomes fixed, loses the stale window, and survives a later correction", async () => {
    const w = await orderWindow(user.ctx.orgId, caseId);
    if (!w) throw new Error("no appeal window");
    as(user.headers);
    const handDate = addDays(TODAY, 40);
    ok(await correctDueDate({ deadlineId: w.id, dueOn: handDate, reason: "Officer's letter" }));
    const corrected = await orderWindow(user.ctx.orgId, caseId);
    expect(corrected).toMatchObject({
      dueOn: handDate,
      windowEndOn: null,
      rule: { type: "fixed", date: handDate },
    });
    expect(corrected?.detail.windowBasis).toBeUndefined();
    expect(corrected?.detail.correctedBy).toBe(user.ctx.userId);
    expect(corrected?.detail.originalDueOn).toBe(w.dueOn);

    ok(
      await correctReceivedDate({
        caseId,
        documentId,
        receivedOn: addDays(served, 2),
        reason: "Register",
      }),
    );
    expect((await orderWindow(user.ctx.orgId, caseId))?.dueOn).toBe(handDate);
    const trail = await withOrg(database, user.ctx.orgId, (tx) =>
      tx.select().from(schema.audit).where(eq(schema.audit.targetId, w.id)),
    );
    expect(trail.some((a) => a.action === "deadline.correct")).toBe(true);
  });

  it("editing a finding's date also fixes the rule and records the edit", async () => {
    const { reply } = await replyOf(user.ctx.orgId, documentId);
    const editor = await authorize("finding.review", { headers: user.headers });
    const handDate = addDays(TODAY, 15);
    await editFinding(editor, {
      findingId: reply.findingId ?? "",
      dueOn: handDate,
      note: "Read the page again",
    });
    const [after] = (await deadlinesOf(user.ctx.orgId, documentId)).filter(
      (d) => d.id === reply.id,
    );
    expect(after).toMatchObject({
      dueOn: handDate,
      windowEndOn: null,
      rule: { type: "fixed", date: handDate },
    });
    expect(after?.detail.correctedBy).toBe(user.ctx.userId);
    const edits = await withOrg(database, user.ctx.orgId, (tx) =>
      tx
        .select()
        .from(findingEdits)
        .where(eq(findingEdits.findingId, reply.findingId ?? "")),
    );
    expect(edits.some((e) => e.field === "due_rule")).toBe(true);

    ok(
      await correctReceivedDate({
        caseId,
        documentId,
        receivedOn: addDays(served, 4),
        reason: "Register again",
      }),
    );
    const [kept] = (await deadlinesOf(user.ctx.orgId, documentId)).filter((d) => d.id === reply.id);
    expect(kept?.dueOn).toBe(handDate);
  });

  it("the case page shows an assumed date as such", async () => {
    const u = await signUp("caseview@harbour.test");
    const { documentId: id } = await upload(u.ctx);
    as(u.headers);
    const c = ok(await openCase({ documentId: id, newClientName: "Coastal Mills" }));
    const view = await loadCase(u.ctx, c.caseId);
    expect(view.notice?.receivedAssumed).toBe(true);
    const reply = view.findings.find((f) => f.deadline?.receivedAssumed);
    expect(reply?.deadline?.warnings).toContain(RECEIVED_ASSUMED_WARNING);
  });
});

describe("H6: every pipeline deadline has someone to remind", () => {
  it("the uploader owns them, and they follow the case owner when filed", async () => {
    const lead = await signUp("lead@harbour.test");
    const { documentId } = await upload(lead.ctx, { receivedOn: addDays(TODAY, -3) });
    for (const d of await deadlinesOf(lead.ctx.orgId, documentId)) {
      expect(d.ownerUserId).toBe(lead.ctx.userId);
      expect(d.detail).toMatchObject({ ownerFrom: "uploader", autoOwner: lead.ctx.userId });
    }

    // A colleague opens the case: it is theirs, and so are the deadlines the app assigned.
    const invitationId = uuidv7();
    await unsafeRawDb(database)
      .insert(invitation)
      .values({
        id: invitationId,
        organizationId: lead.ctx.orgId,
        email: "mira@harbour.test",
        role: "manager",
        status: "pending",
        expiresAt: new Date(Date.now() + 86_400_000),
        inviterId: lead.ctx.userId,
      });
    const mira = await signUp("mira@harbour.test", invitationId);
    expect(mira.ctx.orgId).toBe(lead.ctx.orgId);
    as(mira.headers);
    const { caseId } = ok(await openCase({ documentId, newClientName: "Mira's client" }));
    for (const d of await deadlinesOf(lead.ctx.orgId, documentId)) {
      expect(d.ownerUserId).toBe(mira.ctx.userId);
      expect(d.detail).toMatchObject({ ownerFrom: "case", autoOwner: mira.ctx.userId });
    }
    // Reassigning the case by hand doesn't move deadlines a person already holds.
    as(lead.headers);
    ok(await assignCase({ caseId, ownerUserId: lead.ctx.userId }));
    for (const d of await deadlinesOf(lead.ctx.orgId, documentId))
      expect(d.ownerUserId).toBe(mira.ctx.userId);
  });

  it("the daily job reminds the managers of an unowned item on time, and ignores a snooze once it is late", async () => {
    const boss = await signUp("boss@harbour.test");
    const today = "2026-12-01";
    const base = {
      orgId: boss.ctx.orgId,
      source: "manual" as const,
      rule: { type: "fixed", date: today },
      basis: "Added by hand",
    };
    const unowned = uuidv7();
    const snoozedLate = uuidv7();
    const snoozedAhead = uuidv7();
    await withOrg(database, boss.ctx.orgId, (tx) =>
      tx.insert(deadlines).values([
        {
          ...base,
          id: unowned,
          title: "Unowned return",
          dueOn: addDays(today, 1),
          detail: { adjustments: [], warnings: [] },
        },
        {
          ...base,
          id: snoozedLate,
          title: "Snoozed but late",
          dueOn: addDays(today, -1),
          ownerUserId: boss.ctx.userId,
          detail: { adjustments: [], warnings: [], snoozedUntil: addDays(today, 30) },
        },
        {
          ...base,
          id: snoozedAhead,
          title: "Snoozed and not due",
          dueOn: addDays(today, 1),
          ownerUserId: boss.ctx.userId,
          detail: { adjustments: [], warnings: [], snoozedUntil: addDays(today, 5) },
        },
      ]),
    );
    const outbox: MailMessage[] = [];
    const mailer = {
      send: async (m: MailMessage) => {
        outbox.push(m);
        return { driver: "smtp" as const, delivered: true };
      },
    };
    await runDaily(container, { today, mailer });
    const notes = await withOrg(database, boss.ctx.orgId, (tx) =>
      tx.select().from(notifications).where(eq(notifications.userId, boss.ctx.userId)),
    );
    const about = (id: string) =>
      notes.filter((n) => (n.payload as { deadlineId?: string }).deadlineId === id);
    expect(about(unowned).map((n) => n.kind)).toEqual(["deadline.due_soon"]);
    expect(JSON.stringify(about(unowned)[0]?.payload)).toMatch(/no owner/);
    expect(about(snoozedLate).map((n) => n.kind)).toEqual(["deadline.overdue"]);
    expect(about(snoozedAhead)).toEqual([]);
    const digest = outbox.find((m) => m.to === "boss@harbour.test");
    expect(digest?.text).toContain("Unowned return");
    expect(digest?.text).toContain("Snoozed but late");
    expect(digest?.text).not.toContain("Snoozed and not due");
  });
});

describe("M6: uploads that race or are sent again", () => {
  it("a quarantined file can be sent again, and is read", async () => {
    const u = await signUp("again@harbour.test");
    const first = await upload(u.ctx, { mime: "image/png", receivedOn: TODAY });
    expect(first.done).toMatchObject({ status: "quarantined", reason: "type_mismatch" });
    const runsBefore = pipelineRuns;
    const second = await upload(u.ctx, { receivedOn: TODAY });
    expect(second.documentId).toBe(first.documentId);
    expect(second.done.status).toBe("stored");
    expect(pipelineRuns).toBe(runsBefore + 1);
    const doc = await docRow(u.ctx.orgId, second.documentId);
    expect(doc.mime).toBe("application/pdf");
    expect(["ready", "needs_review"]).toContain(doc.status);
    // Read once, it is a duplicate again.
    const third = await initUpload(u.ctx, {
      filename: "asmt10.pdf",
      size: pdf.byteLength,
      mime: "application/pdf",
      sha256,
    });
    expect(third).toEqual({ status: "duplicate", documentId: first.documentId });
  });

  it("two inits and two completes at once: one document, one pipeline run, no duplicate rows", async () => {
    const u = await signUp("race@harbour.test");
    const input = {
      filename: "asmt10.pdf",
      size: pdf.byteLength,
      mime: "application/pdf",
      sha256,
      receivedOn: TODAY,
    };
    const [a, b] = await Promise.all([initUpload(u.ctx, input), initUpload(u.ctx, input)]);
    if (a.status !== "upload" || b.status !== "upload") throw new Error("expected uploads");
    expect(a.documentId).toBe(b.documentId);
    await put(a.upload.url, a.upload.headers);

    const runsBefore = pipelineRuns;
    const done = await Promise.all([
      completeUpload(u.ctx, a.documentId),
      completeUpload(u.ctx, a.documentId),
    ]);
    expect(done.map((d) => d.status).sort()).toEqual(["duplicate", "stored"]);
    expect(pipelineRuns).toBe(runsBefore + 1);

    const rows = await withOrg(database, u.ctx.orgId, (tx) =>
      tx.select().from(findings).where(eq(findings.documentId, a.documentId)),
    );
    expect(new Set(rows.map((f) => f.ord)).size).toBe(rows.length);
    const ds = await deadlinesOf(u.ctx.orgId, a.documentId);
    expect(new Set(ds.map((d) => d.findingId)).size).toBe(ds.length);

    // The database itself refuses a second deadline for the same finding.
    const first = ds[0];
    if (!first) throw new Error("no deadline");
    await expect(
      withOrg(database, u.ctx.orgId, (tx) =>
        tx.insert(deadlines).values({ ...first, id: uuidv7(), detail: {} }),
      ),
    ).rejects.toThrow();
  });
});
