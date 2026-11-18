/**
 * UX review fixes, in-process on PGlite with the fake engine (H2):
 * deadlines read from documents nobody has filed stay out of Today's and
 * Deadlines' due counts; a document can be set aside as "Not a notice" and
 * put back exactly as it was; a scan and a PDF of the same circular are
 * flagged as possible duplicates; "Nothing is owed" takes a document with
 * no findings out of review, with undo.
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
  documents,
  eq,
  findings,
  migrate,
  schema,
  withOrg,
} from "@dueproof/db";
import { handleLocalStorageRequest, LocalDiskStorage } from "@dueproof/storage";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { saveDemand } from "../features/cases/actions";
import { loadCase } from "../features/cases/queries";
import {
  nothingOwed,
  openCase,
  putBackDocument,
  setAsideDocument,
} from "../features/inbox/actions";
import { findDuplicate, loadInbox } from "../features/inbox/queries";
import { loadToday, summarySentence } from "../features/today/queries";
import { type AuthContext, authorize } from "../lib/authorize";
import { isUnfiled, queryDeadlines } from "../lib/deadline-rows";
import { parseEnv } from "../lib/env";
import { type Container, createEngine, setContainer } from "../lib/server/container";
import { completeUpload, initUpload } from "../lib/upload";
import { processDocument } from "../workflows/process-document";

const fixture = (name: string) =>
  new URL(`../../../services/engine/tests/fixtures/${name}`, import.meta.url);
const APP = "http://localhost:3000";
const NOW = new Date("2026-11-16T06:00:00Z");

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

let dir: string;
let database: Database;
let container: Container;
let owner: Headers;
let ctx: AuthContext;
const ids: Record<string, string> = {};

async function upload(name: string, receivedOn = "2026-10-24"): Promise<string> {
  const bytes = new Uint8Array(await readFile(fixture(name)));
  const up = await authorize("document.upload", { headers: owner });
  const init = await initUpload(up, {
    filename: name,
    size: bytes.byteLength,
    mime: "application/pdf",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    receivedOn,
  });
  if (init.status !== "upload") throw new Error("expected an upload");
  await handleLocalStorageRequest(
    container.storage as LocalDiskStorage,
    new Request(init.upload.url, {
      method: "PUT",
      headers: init.upload.headers,
      body: bytes as BodyInit,
    }),
  );
  await completeUpload(up, init.documentId);
  return init.documentId;
}

const openDeadlines = (documentId: string) =>
  withOrg(database, ctx.orgId, (tx) =>
    tx
      .select({ id: deadlines.id, status: deadlines.status })
      .from(deadlines)
      .innerJoin(findings, eq(findings.id, deadlines.findingId))
      .where(and(eq(findings.documentId, documentId), eq(deadlines.status, "open"))),
  );

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "dueproof-ux-"));
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
  const res = await container.auth.api.signUpEmail({
    body: { email: "asha@firm-ux.test", name: "Asha Rao", password: "a-long-test-password" },
    returnHeaders: true,
  });
  owner = new Headers({
    cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "",
    origin: APP,
  });
  request.headers = owner;
  ctx = await authorize("case.view", { headers: owner });

  ids.notice = await upload("notice-gst-asmt10.pdf");
  ids.pdf = await upload("circular-NMR-SAF-2026-041.pdf");
  ids.scan = await upload("Scan-circular-photo.pdf");
  ids.poster = await upload("edge-poster-page.pdf");
});

afterAll(async () => {
  setContainer(undefined);
  await database.close();
  await rm(dir, { recursive: true, force: true });
});

describe("deadlines from unfiled documents (H2)", () => {
  it("are marked unfiled and kept out of Today's buckets and counts", async () => {
    const rows = await withOrg(database, ctx.orgId, (tx) =>
      queryDeadlines(tx, ctx.orgId, "2026-11-16"),
    );
    const fromNotice = rows.filter((r) => r.source === "notice");
    expect(fromNotice.length).toBeGreaterThan(0);
    expect(fromNotice.every((r) => r.unfiled && r.documentId)).toBe(true);

    const today = await loadToday(ctx, "everyone", NOW);
    expect(today.overdue).toEqual([]);
    expect(today.hearings).toEqual([]);
    expect(today.notFiled.length).toBeGreaterThan(0);
    expect(today.notFiled.every((r) => r.unfiled)).toBe(true);
    expect(summarySentence(today)).toMatch(/in documents not filed yet/);
    expect(summarySentence(today)).not.toMatch(/overdue|hearing/);
  });

  it("count once the document is filed in a case", async () => {
    const r = await openCase({ documentId: ids.notice as string, newClientName: "Harbour Valley" });
    if (!r.ok) throw new Error(r.message);
    ids.case = r.data.caseId;
    const today = await loadToday(ctx, "everyone", NOW);
    expect(today.hearings.map((h) => h.dueOn)).toEqual(["2026-11-18"]);
    expect(today.notFiled.some((n) => n.caseId)).toBe(false);
  });

  it("isUnfiled only holds for read deadlines with no case", () => {
    expect(isUnfiled({ findingId: "f", caseId: null, source: "notice" })).toBe(true);
    expect(isUnfiled({ findingId: "f", caseId: "c", source: "notice" })).toBe(false);
    expect(isUnfiled({ findingId: null, caseId: null, source: "manual" })).toBe(false);
    expect(isUnfiled({ findingId: null, caseId: null, source: "statutory" })).toBe(false);
  });
});

describe("duplicates (H2)", () => {
  it("flag the later of a scan and a PDF of the same circular", async () => {
    const inbox = await loadInbox(ctx, NOW);
    const scan = inbox.toFile.find((d) => d.id === ids.scan);
    const pdf = inbox.toFile.find((d) => d.id === ids.pdf);
    expect(scan?.duplicateOf?.id).toBe(ids.pdf);
    expect(pdf?.duplicateOf).toBeNull();
  });

  it("prefer a twin already filed, and ignore different documents", () => {
    const at = (n: number) => new Date(2026, 10, n);
    const doc = { id: "b", title: "T", reference: null, issuedOn: "2026-08-06", createdAt: at(3) };
    const others = [
      {
        id: "a",
        title: "T",
        reference: null,
        issuedOn: "2026-08-06",
        caseId: null,
        createdAt: at(1),
      },
      {
        id: "c",
        title: "T",
        reference: null,
        issuedOn: "2026-08-06",
        caseId: "k",
        createdAt: at(5),
      },
      {
        id: "d",
        title: "T",
        reference: null,
        issuedOn: "2026-09-01",
        caseId: "k",
        createdAt: at(1),
      },
    ];
    expect(findDuplicate(doc, others)?.id).toBe("c");
    expect(findDuplicate(doc, others.slice(0, 1))?.id).toBe("a");
    expect(findDuplicate({ ...doc, createdAt: at(0) }, others.slice(0, 1))).toBeNull();
    expect(findDuplicate({ ...doc, issuedOn: null }, others)).toBeNull();
  });
});

describe("Not a notice (H2)", () => {
  it("sets a document aside: hidden from To file, deadlines dismissed, audited", async () => {
    const scan = ids.scan as string;
    const before = await openDeadlines(scan);
    expect(before.length).toBeGreaterThan(0);

    const r = await setAsideDocument(scan);
    expect(r.ok).toBe(true);
    expect(await openDeadlines(scan)).toEqual([]);
    const inbox = await loadInbox(ctx, NOW);
    expect(inbox.toFile.some((d) => d.id === scan)).toBe(false);
    expect(inbox.setAside.map((d) => d.id)).toEqual([scan]);
    expect(inbox.review.some((f) => f.documentId === scan)).toBe(false);
    const trail = await withOrg(database, ctx.orgId, (tx) =>
      tx.select().from(schema.audit).where(eq(schema.audit.targetId, scan)),
    );
    expect(trail.map((a) => a.action)).toContain("document.set_aside");
    // Kept, not deleted.
    const [doc] = await withOrg(database, ctx.orgId, (tx) =>
      tx.select({ role: documents.role }).from(documents).where(eq(documents.id, scan)),
    );
    expect(doc?.role).toBe("other");
  });

  it("puts it back exactly as it was", async () => {
    const scan = ids.scan as string;
    const r = await putBackDocument(scan);
    expect(r.ok).toBe(true);
    const inbox = await loadInbox(ctx, NOW);
    expect(inbox.toFile.some((d) => d.id === scan)).toBe(true);
    expect(inbox.setAside).toEqual([]);
    expect((await openDeadlines(scan)).length).toBeGreaterThan(0);
  });

  it("refuses a document filed in a case", async () => {
    const r = await setAsideDocument(ids.notice as string);
    expect(r).toMatchObject({ ok: false });
  });

  it("another firm can't set a document aside", async () => {
    // A member of another firm sees nothing of this one.
    const res = await container.auth.api.signUpEmail({
      body: { email: "ben@firm-other.test", name: "Ben", password: "a-long-test-password" },
      returnHeaders: true,
    });
    request.headers = new Headers({
      cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "",
      origin: APP,
    });
    const r = await setAsideDocument(ids.pdf as string);
    expect(r).toMatchObject({ ok: false, error: "not_found" });
    request.headers = owner;
  });
});

describe("No deadline found (M2)", () => {
  it("'Nothing is owed' takes the document out of review, and Undo brings it back", async () => {
    const poster = ids.poster as string;
    const card = (await loadInbox(ctx, NOW)).review.find((r) => r.documentId === poster);
    expect(card?.kind).toBe("nothing_found");

    expect((await nothingOwed(poster)).ok).toBe(true);
    let inbox = await loadInbox(ctx, NOW);
    expect(inbox.review.some((r) => r.documentId === poster)).toBe(false);
    expect(inbox.toFile.some((d) => d.id === poster)).toBe(true);

    expect((await nothingOwed(poster, true)).ok).toBe(true);
    inbox = await loadInbox(ctx, NOW);
    expect(inbox.review.some((r) => r.documentId === poster)).toBe(true);
  });
});

describe("demand workings (M4)", () => {
  it("speak plainly: house dates, 'computed to', and the CA note on the penalty", async () => {
    const caseId = ids.case as string;
    const before = await loadCase(ctx, caseId, NOW);
    const amount = before.findings.find((f) => f.kind === "amount" && f.amountMinor);
    const r = await saveDemand({
      caseId,
      taxType: "gst",
      principalMinor: amount?.amountMinor ?? 45_230_000,
      ...(amount ? { findingId: amount.id } : {}),
      interestRule: "in.gst.s50.1",
      penaltyRule: "in.gst.s73",
      dueOn: "2026-10-20",
      asOf: "2026-11-16",
    });
    if (!r.ok) throw new Error(r.message);
    const d = (await loadCase(ctx, caseId, NOW)).demands[0];
    expect(d?.asOfLabel).toBe("16 Nov 2026");
    expect(d?.penaltyVerified).toBe(false);
    expect(d?.rateSource).toContain("Not yet checked by a chartered accountant.");
    const text = JSON.stringify(d);
    expect(text).not.toMatch(/M0|verify in/);
    expect(d?.workings[0]?.inputs).toMatchObject({ "computed to": "16 Nov 2026" });
    expect(d?.workings[0]?.inputs).not.toHaveProperty("paid on");
    if (amount) expect(d?.findingId).toBe(amount.id);
  });
});
