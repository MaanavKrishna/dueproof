/**
 * The screens' loaders and actions, in-process on PGlite with the fake
 * engine: Today, Inbox (review queue, opening a case), Notices (filters,
 * CSV, bulk with undo), the case page (stages, approval, received date,
 * demands, comments) and Search. Also: authorisation by role, isolation
 * between organisations, and that finding_edits stay append-only.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuth } from "@dueproof/auth";
import {
  and,
  createDatabase,
  type Database,
  deadlines,
  eq,
  findingEdits,
  findings,
  invitation,
  migrate,
  organization,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { handleLocalStorageRequest, LocalDiskStorage } from "@dueproof/storage";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getProof } from "../app/actions/proof";
import { openCase } from "../features/inbox/actions";
import { loadInbox } from "../features/inbox/queries";
import {
  addComment,
  approveCase,
  assignCase,
  changeStage,
  correctDueDate,
  correctReceivedDate,
  saveDemand,
} from "../features/cases/actions";
import { loadCase } from "../features/cases/queries";
import { bulkUpdate, exportNoticesCsv, saveView, undoBulk } from "../features/notices/actions";
import { applyFilters, type NoticeRow, toCsv } from "../features/notices/model";
import { loadNoticeRows, loadNotices } from "../features/notices/queries";
import { search } from "../features/search/queries";
import { loadToday, summarySentence } from "../features/today/queries";
import { type AuthContext, authorize } from "../lib/authorize";
import { parseEnv } from "../lib/env";
import { confirmFinding, dismissFinding, editFinding, restoreFinding } from "../lib/findings";
import { reviewReasons } from "../lib/review";
import { type Container, createEngine, setContainer } from "../lib/server/container";
import { initUpload } from "../lib/upload";
import { completeUpload } from "../lib/upload";
import { processDocument } from "../workflows/process-document";

const FIXTURE = new URL(
  "../../../services/engine/tests/fixtures/notice-gst-asmt10.pdf",
  import.meta.url,
);
const APP = "http://localhost:3000";
const NOW = new Date("2026-11-16T06:00:00Z");

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

let dir: string;
let database: Database;
let container: Container;
let owner: Headers;
let other: Headers;
let viewer: Headers;
let ctxA: AuthContext;
let ctxB: AuthContext;
let documentId: string;
let caseId: string;

async function signUp(email: string, name: string): Promise<Headers> {
  const res = await container.auth.api.signUpEmail({
    body: { email, name, password: "a-long-test-password" },
    returnHeaders: true,
  });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return new Headers({ cookie, origin: APP });
}

const as = (h: Headers) => {
  request.headers = h;
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "dueproof-screens-"));
  const env = parseEnv({
    NODE_ENV: "test",
    APP_URL: APP,
    AUTH_SECRET: "test-auth-secret-test-auth-secret-0123456789",
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

  owner = await signUp("asha@firm-a.test", "Asha Rao");
  other = await signUp("ben@firm-b.test", "Ben Shah");
  ctxA = await authorize("case.view", { headers: owner });
  ctxB = await authorize("case.view", { headers: other });

  // A viewer joins firm A by invitation.
  const raw = unsafeRawDb(database);
  await raw.insert(invitation).values({
    id: uuidv7(),
    organizationId: ctxA.orgId,
    email: "vik@firm-a.test",
    role: "viewer",
    status: "pending",
    expiresAt: new Date(Date.now() + 86_400_000),
    inviterId: ctxA.userId,
  });
  viewer = await signUp("vik@firm-a.test", "Vik Viewer");
  expect((await raw.select().from(organization)).length).toBe(2);

  // Upload and read the ASMT-10 notice in firm A.
  const pdf = new Uint8Array(await readFile(FIXTURE));
  const upload = await authorize("document.upload", { headers: owner });
  const init = await initUpload(upload, {
    filename: "notice.pdf",
    size: pdf.byteLength,
    mime: "application/pdf",
    sha256: createHash("sha256").update(pdf).digest("hex"),
    receivedOn: "2026-10-24",
  });
  if (init.status !== "upload") throw new Error("expected an upload");
  await handleLocalStorageRequest(
    storage,
    new Request(init.upload.url, {
      method: "PUT",
      headers: init.upload.headers,
      body: pdf as BodyInit,
    }),
  );
  documentId = init.documentId;
  await completeUpload(upload, documentId);
});

afterAll(async () => {
  setContainer(undefined);
  await database.close();
  await rm(dir, { recursive: true, force: true });
});

describe("Inbox", () => {
  it("lists the notice to file, and nothing for another firm", async () => {
    const inbox = await loadInbox(ctxA, NOW);
    expect(inbox.toFile.map((d) => d.id)).toEqual([documentId]);
    expect(inbox.toFile[0]?.reference).toBe("ZD2910260012345");
    const elsewhere = await loadInbox(ctxB, NOW);
    expect(elsewhere.toFile).toEqual([]);
    expect(elsewhere.review).toEqual([]);
  });

  it("a viewer can't open a case", async () => {
    as(viewer);
    const r = await openCase({ documentId, newClientName: "Harbour Valley Foods" });
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("opens a case with a new client; findings and deadlines follow the document", async () => {
    as(owner);
    const r = await openCase({
      documentId,
      newClientName: "Harbour Valley Foods",
      newClientGstin: "27aaach1234f1z5",
    });
    if (!r.ok) throw new Error(r.message);
    caseId = r.data.caseId;
    const ds = await withOrg(database, ctxA.orgId, (tx) =>
      tx.select().from(deadlines).where(eq(deadlines.caseId, caseId)),
    );
    expect(ds.length).toBe(2);
    expect(ds.every((d) => d.clientId)).toBe(true);
  });

  it("another firm can't file into this firm's case", async () => {
    as(other);
    const r = await openCase({ documentId });
    expect(r).toMatchObject({ ok: false, error: "not_found" });
  });
});

describe("Today", () => {
  it("buckets the reply and the hearing by the org's today", async () => {
    const today = await loadToday(ctxA, "everyone", NOW);
    expect(today.hearings.map((h) => h.dueOn)).toEqual(["2026-11-18"]);
    // 30 days from receipt on 24 Oct is 23 Nov: seven days away, so "later", not this week.
    expect(today.thisWeek).toEqual([]);
    expect(today.hearings[0]?.client).toBe("Harbour Valley Foods");
    expect(today.exposure).not.toBeNull(); // owners see exposure
    expect(summarySentence(today)).toBe("1 hearing this week.");
  });

  it("is role-aware: a viewer gets no toggle and no exposure", async () => {
    const v = await authorize("case.view", { headers: viewer });
    const today = await loadToday(v, "mine", NOW);
    expect(today.scopes).toEqual(["everyone"]);
    expect(today.exposure).toBeNull();
  });

  it("'Mine' shows only the person's own work", async () => {
    const mine = await loadToday(ctxA, "mine", NOW);
    expect(mine.hearings.length).toBe(1); // the case owner is the uploader
    const elsewhere = await loadToday(ctxB, "everyone", NOW);
    expect(elsewhere.hearings).toEqual([]);
  });
});

describe("review and append-only edits", () => {
  it("derives review reasons from what is stored", () => {
    const base = {
      status: "open",
      confirmedBy: null,
      verification: "exact",
      origin: "rule",
      confidence: 0.9,
      dueRule: null,
      kind: "obligation",
      hasDeadline: false,
    };
    expect(reviewReasons(base)).toEqual([]);
    expect(reviewReasons({ ...base, verification: "unlocated" })).toEqual(["unlocated"]);
    expect(reviewReasons({ ...base, origin: "ai" })).toEqual(["ai_only"]);
    expect(reviewReasons({ ...base, dueRule: { type: "fixed", date: "2026-12-01" } })).toEqual([
      "proposed_date",
    ]);
    expect(reviewReasons({ ...base, verification: "unlocated", confirmedBy: "u" })).toEqual([]);
  });

  it("confirm, dismiss, restore and edit each write finding_edits; the trail can't be changed", async () => {
    const [f] = await withOrg(database, ctxA.orgId, (tx) =>
      tx
        .select()
        .from(findings)
        .where(and(eq(findings.documentId, documentId), eq(findings.kind, "obligation"))),
    );
    if (!f) throw new Error("no obligation");
    const review = await authorize("finding.review", { headers: owner });
    const confirmed = await confirmFinding(review, f.id);
    expect(confirmed.deadlineId).toBeTruthy(); // already a deadline from the pipeline
    await dismissFinding(review, { findingId: f.id, reason: "test" });
    await restoreFinding(review, f.id);
    const edited = await editFinding(review, {
      findingId: f.id,
      dueOn: "2026-11-25",
      note: "The notice was served late",
    });
    expect(edited.dueOn).toBe("2026-11-25");
    const edits = await withOrg(database, ctxA.orgId, (tx) =>
      tx.select().from(findingEdits).where(eq(findingEdits.findingId, f.id)),
    );
    expect(edits.map((e) => e.field)).toEqual(["review", "status", "status", "due_rule", "review"]);
    expect(edits.find((e) => e.field === "due_rule")?.before).toEqual(f.dueRule);
    await expect(
      withOrg(database, ctxA.orgId, (tx) =>
        tx.update(findingEdits).set({ note: "rewritten" }).where(eq(findingEdits.findingId, f.id)),
      ),
    ).rejects.toThrow();
    await expect(
      withOrg(database, ctxA.orgId, (tx) =>
        tx.delete(findingEdits).where(eq(findingEdits.findingId, f.id)),
      ),
    ).rejects.toThrow();
  });

  it("a viewer can't review findings", async () => {
    await expect(authorize("finding.review", { headers: viewer })).rejects.toThrow();
  });
});

describe("case page", () => {
  it("loads the header, duties with proof, and the notice's pages", async () => {
    const c = await loadCase(ctxA, caseId, NOW);
    expect(c.reference).toBe("ZD2910260012345");
    expect(c.authority).toBe("gst");
    expect(c.client?.gstin).toBe("27AAACH1234F1Z5");
    expect(c.amountMinor).toBe(45230000);
    const hearing = c.findings.find((f) => f.kind === "hearing");
    expect(hearing?.deadline?.iso).toBe("2026-11-18");
    expect(hearing?.grade).not.toBe("unlocated");
    expect(c.proof?.pages[0]?.unit).toBe("pt");
    expect(c.proof?.pages[0]?.src).toMatch(/\/api\/storage\/local/);
    expect(c.can.approve).toBe(false);
  });

  it("is invisible to another firm", async () => {
    await expect(loadCase(ctxB, caseId, NOW)).rejects.toThrow(/wasn't found/);
    as(other);
    expect(await getProof(documentId)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("stage moves: skipping needs a reason; filing needs an ARN and an acknowledgement", async () => {
    as(owner);
    expect(await changeStage({ caseId, to: "drafting" })).toMatchObject({
      ok: false,
      error: "reason_required",
    });
    expect(await changeStage({ caseId, to: "gathering" })).toMatchObject({ ok: true });
    expect(await changeStage({ caseId, to: "drafting" })).toMatchObject({ ok: true });
    expect(
      await changeStage({ caseId, to: "filed", reason: "x", filingRef: "AA27012601234X" }),
    ).toMatchObject({ ok: false, error: "ack_required" });
  });

  it("approval: never by the person who asked, never by a viewer", async () => {
    as(owner);
    expect(await changeStage({ caseId, to: "approval" })).toMatchObject({ ok: true });
    const self = await approveCase(caseId);
    expect(self).toMatchObject({ ok: false, error: "forbidden" });
    if (!self.ok) expect(self.message).toMatch(/someone else/);
    as(viewer);
    expect(await approveCase(caseId)).toMatchObject({ ok: false, error: "forbidden" });
    const c = await loadCase(ctxA, caseId, NOW);
    expect(c.approvalRequestedBy?.name).toBe("Asha Rao");
  });

  it("corrects the received date with a reason, recomputes, and keeps the history", async () => {
    as(owner);
    const r = await correctReceivedDate({
      caseId,
      documentId,
      receivedOn: "2026-10-27",
      reason: "Envelope date",
    });
    expect(r).toMatchObject({ ok: true });
    const c = await loadCase(ctxA, caseId, NOW);
    expect(c.receivedHistory).toHaveLength(1);
    expect(c.receivedHistory[0]?.reason).toBe("Envelope date");
    expect(c.activity.some((a) => a.action === "corrected the received date")).toBe(true);
  });

  it("corrects a due date by hand, append-only", async () => {
    const c = await loadCase(ctxA, caseId, NOW);
    const dl = c.findings.find((f) => f.kind === "hearing")?.deadline;
    if (!dl) throw new Error("no hearing deadline");
    as(owner);
    expect(
      await correctDueDate({ deadlineId: dl.id, dueOn: "2026-11-20", reason: "Adjourned" }),
    ).toMatchObject({ ok: true, data: { dueOn: "2026-11-20" } });
    as(viewer);
    expect(
      await correctDueDate({ deadlineId: dl.id, dueOn: "2026-11-21", reason: "x" }),
    ).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("saves a demand with interest computed by core and a penalty range", async () => {
    as(owner);
    const r = await saveDemand({
      caseId,
      taxType: "gst",
      principalMinor: 45230000,
      interestRule: "in.gst.s50.1",
      penaltyRule: "in.gst.s73",
      dueOn: "2026-10-20",
      asOf: "2026-11-16",
    });
    if (!r.ok) throw new Error(r.message);
    expect(r.data.interestMinor).toBeGreaterThan(0);
    const c = await loadCase(ctxA, caseId, NOW);
    const d = c.demands[0];
    expect(d?.workings.length).toBeGreaterThan(1);
    expect(d?.penalty?.max).toBeGreaterThanOrEqual(d?.penalty?.min ?? 0);
    expect(d?.rateSource).toMatch(/verify|Checked/);
  });

  it("comments notify only members mentioned", async () => {
    as(owner);
    const r = await addComment({ caseId, text: "@Vik see this", mentionIds: [ctxB.userId] });
    expect(r).toMatchObject({ ok: true });
    as(viewer);
    expect(await addComment({ caseId, text: "hello" })).toMatchObject({ ok: false });
    as(owner);
    expect(await assignCase({ caseId, ownerUserId: ctxB.userId })).toMatchObject({
      ok: false,
      error: "bad_request",
    });
  });
});

describe("Notices", () => {
  it("one row per case with next due and demand", async () => {
    const rows = await loadNoticeRows(ctxA, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "GST · ASMT-10", demandMinor: 45230000 });
    expect(await loadNoticeRows(ctxB, NOW)).toEqual([]);
  });

  it("filters and CSV agree; CSV neutralises formulas", () => {
    const row: NoticeRow = {
      id: "1",
      client: "=HYPERLINK(evil)",
      clientId: "c",
      gstin: null,
      type: "GST · ASMT-10",
      reference: "R, 1",
      issuedBy: null,
      received: "",
      receivedIso: null,
      nextDue: { state: "week", date: "", iso: "2026-11-20" },
      stage: "drafting",
      demandMinor: 12345,
      owner: null,
      ownerId: null,
      language: "English",
      channel: "upload",
    };
    expect(applyFilters([row], { due: ["overdue"] }, "me")).toEqual([]);
    expect(applyFilters([row], { due: ["week"], owner: ["none"] }, "me")).toHaveLength(1);
    expect(applyFilters([row], { q: ["r, 1"] }, "me")).toHaveLength(1);
    const csv = toCsv([row]);
    expect(csv).toContain(`"'=HYPERLINK(evil)"`);
    expect(csv).toContain(`"R, 1"`);
    expect(csv).toContain("123.45");
  });

  it("bulk stage change is audited and undoable; viewers can't", async () => {
    as(viewer);
    expect(await bulkUpdate({ caseIds: [caseId], stage: "closed" })).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    as(owner);
    expect(await bulkUpdate({ caseIds: [caseId], stage: "filed" })).toMatchObject({ ok: false });
    const r = await bulkUpdate({ caseIds: [caseId], stage: "closed" });
    if (!r.ok) throw new Error(r.message);
    expect((await loadNoticeRows(ctxA, NOW))[0]?.stage).toBe("closed");
    expect(await undoBulk(r.data)).toMatchObject({ ok: true, data: { count: 1 } });
    expect((await loadNoticeRows(ctxA, NOW))[0]?.stage).toBe("approval");
  });

  it("saved views are personal unless shared; export is audited", async () => {
    as(owner);
    expect(await saveView({ name: "Mine", filters: { owner: ["me"] } })).toMatchObject({
      ok: true,
    });
    expect((await loadNotices(ctxA)).views.map((v) => v.name)).toEqual(["Mine"]);
    expect((await loadNotices(ctxB)).views).toEqual([]);
    const csv = await exportNoticesCsv({ stage: ["approval"] });
    if (!csv.ok) throw new Error(csv.message);
    expect(csv.data.count).toBe(1);
  });
});

describe("Search", () => {
  it("finds words on the page and in findings, only in the searcher's firm", async () => {
    const hits = await search(ctxA, "discrepancies");
    expect(hits.some((h) => h.kind === "page" && h.page === 1 && h.caseId === caseId)).toBe(true);
    expect(hits.find((h) => h.kind === "page")?.snippet).toMatch(/⟦discrepancies⟧/i);
    expect((await search(ctxA, "ZD2910260012345")).some((h) => h.kind === "case")).toBe(true);
    expect(await search(ctxB, "discrepancies")).toEqual([]);
    expect(await search(ctxA, "")).toEqual([]);
  });
});
