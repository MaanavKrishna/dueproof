/**
 * Security review fixes, in-process (PGlite, local storage, fake engine):
 *
 * - M2 client-level access: a matrix of every entry point that reads or
 *   changes a document, finding, case or deadline, for a member limited to
 *   another client, a member with every client, and an admin.
 * - M1 undoBulk: held to the rules of the change it undoes.
 * - I3 filing without partner approval: its own permission, audited, shown.
 * - L7 data.export and statutory.override.
 * - M6 uploads: the case and client are checked; the stored original can't
 *   be replaced through the upload URL after it was verified.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuth } from "@dueproof/auth";
import {
  cases,
  clients,
  createDatabase,
  type Database,
  deadlines,
  documents,
  eq,
  findings,
  invitation,
  migrate,
  schema,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { handleLocalStorageRequest, LocalDiskStorage } from "@dueproof/storage";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { retryDocument, unlockDocument } from "../app/actions/documents";
import {
  confirmFinding,
  dismissFinding,
  editFinding,
  restoreFinding,
} from "../app/actions/findings";
import { getProof } from "../app/actions/proof";
import { GET as eventsRoute } from "../app/api/v1/documents/[id]/events/route";
import { GET as documentRoute } from "../app/api/v1/documents/[id]/route";
import { GET as reportRoute } from "../app/api/v1/reports/[name]/route";
import { changeStage, correctDueDate } from "../features/cases/actions";
import { loadCase } from "../features/cases/queries";
import { addManualDeadline, dismissDeadline } from "../features/deadlines/actions";
import { loadDeadlinesPage } from "../features/deadlines/queries";
import { fileInCase, openCase } from "../features/inbox/actions";
import { loadInbox } from "../features/inbox/queries";
import { bulkUpdate, exportNoticesCsv, undoBulk } from "../features/notices/actions";
import { loadNoticeRows } from "../features/notices/queries";
import { search } from "../features/search/queries";
import { loadToday } from "../features/today/queries";
import { type AuthContext, authorize } from "../lib/authorize";
import { getDocumentDetail } from "../lib/documents";
import { parseEnv } from "../lib/env";
import { type Container, createEngine, setContainer } from "../lib/server/container";
import { updateOrgMetadata } from "../lib/server/directory";
import { completeUpload, initUpload } from "../lib/upload";
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
let pdf: Uint8Array;
const people: Record<"owner" | "admin" | "full" | "limited" | "viewer" | "other", Headers> =
  {} as never;
let ctxOwner: AuthContext;
/** Client 1: the limited member's. Client 2: not theirs. */
let c1: string;
let c2: string;
/** The notice, processed and filed into case 2 (client 2). */
let doc2: string;
let case2: string;
let finding2: string;
/** A case for client 1. */
let case1: string;

const as = (h: Headers) => {
  request.headers = h;
};
const ctxOf = (who: keyof typeof people) => authorize("case.view", { headers: people[who] });

async function signUp(email: string, name: string): Promise<Headers> {
  const res = await container.auth.api.signUpEmail({
    body: { email, name, password: "a-long-test-password" },
    returnHeaders: true,
  });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return new Headers({ cookie, origin: APP });
}

async function invite(email: string, name: string, role: string): Promise<Headers> {
  await unsafeRawDb(database)
    .insert(invitation)
    .values({
      id: uuidv7(),
      organizationId: ctxOwner.orgId,
      email,
      role,
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: ctxOwner.userId,
    });
  return signUp(email, name);
}

/** Upload bytes as `ctx` through init → signed PUT → complete. */
async function upload(ctx: AuthContext, bytes: Uint8Array, extra: object = {}) {
  const init = await initUpload(ctx, {
    filename: "notice.pdf",
    size: bytes.byteLength,
    mime: "application/pdf",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    receivedOn: "2026-10-24",
    ...extra,
  });
  if (init.status !== "upload") throw new Error("expected an upload");
  const put = await handleLocalStorageRequest(
    container.storage as LocalDiskStorage,
    new Request(init.upload.url, {
      method: "PUT",
      headers: init.upload.headers,
      body: bytes as BodyInit,
    }),
  );
  expect(put.status).toBe(200);
  return init;
}

/** "ok", or the error code an action or route answered with. */
async function outcome(p: Promise<unknown>): Promise<string> {
  try {
    const r = await p;
    if (r instanceof Response) {
      if (r.ok) {
        await r.body?.cancel();
        return "ok";
      }
      return ((await r.json()) as { error: string }).error;
    }
    const a = r as { ok?: boolean; error?: string };
    if (a && typeof a === "object" && "ok" in a) return a.ok ? "ok" : (a.error ?? "error");
    return "ok";
  } catch (e) {
    return (e as { code?: string }).code ?? "thrown";
  }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "dueproof-access-"));
  pdf = new Uint8Array(await readFile(FIXTURE));
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

  people.owner = await signUp("asha@firm-a.test", "Asha Rao");
  people.other = await signUp("ben@firm-b.test", "Ben Shah");
  ctxOwner = await ctxOf("owner");
  people.admin = await invite("adi@firm-a.test", "Adi Admin", "admin");
  people.full = await invite("fay@firm-a.test", "Fay Full", "member");
  people.limited = await invite("lim@firm-a.test", "Lim Ited", "member");
  people.viewer = await invite("vik@firm-a.test", "Vik Viewer", "viewer");

  const init = await upload(await authorize("document.upload", { headers: people.owner }), pdf);
  doc2 = init.documentId;
  await completeUpload(await authorize("document.upload", { headers: people.owner }), doc2);
  as(people.owner);
  const opened = await openCase({ documentId: doc2, newClientName: "Secret Client Two" });
  if (!opened.ok) throw new Error(opened.message);
  case2 = opened.data.caseId;
  const [k] = await withOrg(database, ctxOwner.orgId, (tx) =>
    tx.select().from(cases).where(eq(cases.id, case2)),
  );
  c2 = k?.clientId as string;
  c1 = uuidv7();
  case1 = uuidv7();
  await withOrg(database, ctxOwner.orgId, async (tx) => {
    await tx.insert(clients).values({ id: c1, orgId: ctxOwner.orgId, name: "Allowed Client One" });
    await tx.insert(cases).values({
      id: case1,
      orgId: ctxOwner.orgId,
      clientId: c1,
      title: "Client one's case",
      ownerUserId: ctxOwner.userId,
    });
  });
  const [f] = await withOrg(database, ctxOwner.orgId, (tx) =>
    tx.select().from(findings).where(eq(findings.documentId, doc2)),
  );
  finding2 = f?.id as string;
  const limited = await ctxOf("limited");
  await updateOrgMetadata(database, ctxOwner.orgId, (m) => ({
    ...m,
    clientAccess: { [limited.userId]: [c1] },
  }));
});

afterAll(async () => {
  setContainer(undefined);
  await database.close();
  await rm(dir, { recursive: true, force: true });
});

describe("client-level access (M2)", () => {
  it("authorize() resolves each person's clients from one place", async () => {
    expect((await ctxOf("limited")).clientIds).toEqual([c1]);
    expect((await ctxOf("full")).clientIds).toBeUndefined();
    expect((await ctxOf("admin")).clientIds).toBeUndefined();
  });

  type Who = "limited" | "full" | "admin";
  /** Each entry point, against client 2's document, finding, case or deadline. */
  const probes: [string, (who: Who) => Promise<string>, Record<Who, string>][] = [
    [
      "getDocumentDetail",
      async (who) => outcome(getDocumentDetail(await ctxOf(who), doc2)),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "GET /api/v1/documents/{id}",
      async (who) =>
        outcome(
          documentRoute(new Request(`${APP}/api/v1/documents/${doc2}`, { headers: people[who] }), {
            params: Promise.resolve({ id: doc2 }),
          }),
        ),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "GET /api/v1/documents/{id}/events",
      async (who) =>
        outcome(
          eventsRoute(
            new Request(`${APP}/api/v1/documents/${doc2}/events`, { headers: people[who] }),
            { params: Promise.resolve({ id: doc2 }) },
          ),
        ),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "getProof",
      async () => outcome(getProof(doc2)),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "confirmFinding",
      async () => outcome(confirmFinding(finding2)),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "editFinding",
      async () =>
        outcome(editFinding({ findingId: finding2, text: "Reply in writing", note: "n" })),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "dismissFinding",
      async () => outcome(dismissFinding({ findingId: finding2 })),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "restoreFinding",
      async () => outcome(restoreFinding(finding2)),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "fileInCase: client 2's document into client 1's case",
      async () => outcome(fileInCase({ documentId: doc2, caseId: case1 })),
      // Full members may move it; put it back so the next probe starts the same.
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "fileInCase: back into client 2's case",
      async () => outcome(fileInCase({ documentId: doc2, caseId: case2 })),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "openCase: client 2's document for client 1",
      async (who) =>
        who === "limited"
          ? outcome(openCase({ documentId: doc2, clientId: c1, title: "mine now" }))
          : "skipped",
      { limited: "not_found", full: "skipped", admin: "skipped" },
    ],
    [
      "retryDocument",
      async () => outcome(retryDocument(doc2)),
      // Allowed through, then refused because the document didn't fail.
      { limited: "not_found", full: "wrong_state", admin: "wrong_state" },
    ],
    [
      "unlockDocument",
      async () => outcome(unlockDocument({ documentId: doc2, password: "x" })),
      { limited: "not_found", full: "wrong_state", admin: "wrong_state" },
    ],
    [
      "initUpload naming client 2's case",
      async (who) =>
        outcome(
          initUpload(await authorize("document.upload", { headers: people[who] }), {
            filename: "x.pdf",
            size: 10,
            mime: "application/pdf",
            sha256: createHash("sha256").update(`case-${who}`).digest("hex"),
            caseId: case2,
          }),
        ),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "initUpload naming client 2",
      async (who) =>
        outcome(
          initUpload(await authorize("document.upload", { headers: people[who] }), {
            filename: "x.pdf",
            size: 10,
            mime: "application/pdf",
            sha256: createHash("sha256").update(`client-${who}`).digest("hex"),
            clientId: c2,
          }),
        ),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "addManualDeadline on client 2's case",
      async () =>
        outcome(
          addManualDeadline({ title: "Call the officer", dueOn: "2026-12-01", caseId: case2 }),
        ),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
    [
      "loadCase",
      async (who) => outcome(loadCase(await ctxOf(who), case2)),
      { limited: "not_found", full: "ok", admin: "ok" },
    ],
  ];

  for (const [name, probe, want] of probes) {
    it(`${name}: limited ${want.limited}, full ${want.full}, admin ${want.admin}`, async () => {
      for (const who of ["limited", "full", "admin"] as const) {
        as(people[who]);
        expect(`${who}: ${await probe(who)}`).toBe(`${who}: ${want[who]}`);
      }
    });
  }

  it("the document was never moved to the limited member's client", async () => {
    const [d] = await withOrg(database, ctxOwner.orgId, (tx) =>
      tx.select().from(documents).where(eq(documents.id, doc2)),
    );
    expect(d?.clientId).toBe(c2);
  });

  it("lists leave client 2 out for the limited member only", async () => {
    const seen = async (who: Who) => {
      const ctx = await ctxOf(who);
      const inbox = await loadInbox(ctx);
      const deadlinesPage = await loadDeadlinesPage(ctx);
      const today = await loadToday(ctx, "everyone");
      return {
        search: (await search(ctx, "discrepancies")).length > 0,
        notices: (await loadNoticeRows(ctx)).some((r) => r.id === case2),
        deadlines: deadlinesPage.rows.some((r) => r.clientId === c2),
        today: [...today.overdue, ...today.dueToday, ...today.thisWeek, ...today.hearings].some(
          (r) => r.caseId === case2,
        ),
        review: inbox.review.some((r) => r.documentId === doc2),
      };
    };
    expect(await seen("limited")).toEqual({
      search: false,
      notices: false,
      deadlines: false,
      today: false,
      review: false,
    });
    const full = await seen("full");
    expect(full.search && full.notices && full.deadlines).toBe(true);
  });

  it("an upload can't name another organisation's case or client", async () => {
    const ctxB = await authorize("document.upload", { headers: people.other });
    for (const ref of [{ caseId: case2 }, { clientId: c2 }]) {
      expect(
        await outcome(
          initUpload(ctxB, {
            filename: "x.pdf",
            size: 10,
            mime: "application/pdf",
            sha256: createHash("sha256").update(JSON.stringify(ref)).digest("hex"),
            ...ref,
          }),
        ),
      ).toBe("not_found");
    }
  });

  it("an upload filed to a case takes the case's client", async () => {
    const ctx = await authorize("document.upload", { headers: people.owner });
    const init = await initUpload(ctx, {
      filename: "x.pdf",
      size: 10,
      mime: "application/pdf",
      sha256: createHash("sha256").update("derive").digest("hex"),
      caseId: case1,
    });
    const [d] = await withOrg(database, ctxOwner.orgId, (tx) =>
      tx.select().from(documents).where(eq(documents.id, init.documentId)),
    );
    expect(d?.clientId).toBe(c1);
    expect(
      await outcome(
        initUpload(ctx, {
          filename: "x.pdf",
          size: 10,
          mime: "application/pdf",
          sha256: createHash("sha256").update("mismatch").digest("hex"),
          caseId: case1,
          clientId: c2,
        }),
      ),
    ).toBe("bad_request");
  });
});

describe("undoBulk (M1)", () => {
  it("a limited member can't undo on another client's case", async () => {
    as(people.limited);
    const limited = await ctxOf("limited");
    expect(
      await outcome(
        undoBulk({ items: [{ id: case2, ownerUserId: limited.userId, stage: "closed" }] }),
      ),
    ).toBe("not_found");
  });

  it("changing the owner needs case.assign, as assigning does", async () => {
    as(people.full);
    const full = await ctxOf("full");
    expect(await outcome(bulkUpdate({ caseIds: [case2], ownerUserId: full.userId }))).toBe(
      "forbidden",
    );
    expect(
      await outcome(
        undoBulk({ items: [{ id: case2, ownerUserId: full.userId, stage: "received" }] }),
      ),
    ).toBe("forbidden");
  });

  it("the owner must be in the organisation", async () => {
    as(people.owner);
    const stranger = uuidv7();
    expect(
      await outcome(undoBulk({ items: [{ id: case2, ownerUserId: stranger, stage: "received" }] })),
    ).toBe("bad_request");
    expect(await outcome(bulkUpdate({ caseIds: [case2], ownerUserId: stranger }))).toBe(
      "bad_request",
    );
  });

  it("a stage goes through the stage rules: no filing without the acknowledgement", async () => {
    as(people.full);
    expect(
      await outcome(
        undoBulk({ items: [{ id: case2, ownerUserId: ctxOwner.userId, stage: "filed" }] }),
      ),
    ).toBe("forbidden"); // filing a reply nobody approved
    as(people.owner);
    expect(
      await outcome(
        undoBulk({ items: [{ id: case2, ownerUserId: ctxOwner.userId, stage: "filed" }] }),
      ),
    ).toBe("filing_ref_required");
    const [k] = await withOrg(database, ctxOwner.orgId, (tx) =>
      tx.select().from(cases).where(eq(cases.id, case2)),
    );
    expect(k?.stage).toBe("received");
    expect(k?.ownerUserId).toBe(ctxOwner.userId);
  });

  it("a genuine undo still works", async () => {
    as(people.full);
    const r = await bulkUpdate({ caseIds: [case2], stage: "gathering" });
    if (!r.ok) throw new Error(r.message);
    expect(await outcome(undoBulk(r.data))).toBe("ok");
    const [k] = await withOrg(database, ctxOwner.orgId, (tx) =>
      tx.select().from(cases).where(eq(cases.id, case2)),
    );
    expect(k?.stage).toBe("received");
  });
});

describe("filing without partner approval (I3)", () => {
  it("needs reply.skip_approval and a reason; it is audited and shown on the case", async () => {
    as(people.full);
    expect(await outcome(changeStage({ caseId: case1, to: "drafting", reason: "Quick one" }))).toBe(
      "ok",
    );
    expect(
      await outcome(changeStage({ caseId: case1, to: "filed", filingRef: "AA27012601234X" })),
    ).toBe("reason_required");
    expect(
      await outcome(
        changeStage({ caseId: case1, to: "filed", reason: "Partner away", filingRef: "AA1" }),
      ),
    ).toBe("forbidden");

    // An acknowledgement in the thread, then a manager or partner may file without approval.
    await withOrg(database, ctxOwner.orgId, (tx) =>
      tx.insert(documents).values({
        id: uuidv7(),
        orgId: ctxOwner.orgId,
        caseId: case1,
        clientId: c1,
        filename: "ack.pdf",
        mime: "application/pdf",
        sizeBytes: 1,
        sha256: "a".repeat(64),
        storageKey: `org/${ctxOwner.orgId}/originals/${"a".repeat(64)}`,
        role: "acknowledgement",
        channel: "upload",
        status: "stored",
      }),
    );
    as(people.owner);
    expect(
      await outcome(
        changeStage({ caseId: case1, to: "filed", reason: "Partner away", filingRef: "AA1" }),
      ),
    ).toBe("ok");
    const rows = await withOrg(database, ctxOwner.orgId, (tx) =>
      tx.select().from(schema.audit).where(eq(schema.audit.targetId, case1)),
    );
    expect(rows.find((r) => r.action === "case.approval_skipped")?.detail).toMatchObject({
      reason: "Partner away",
      to: "filed",
    });
    const c = await loadCase(ctxOwner, case1);
    expect(c.approvalSkipped).toEqual({ by: "Asha Rao", reason: "Partner away" });
    expect(c.activity.some((a) => a.action === "filed without partner approval")).toBe(true);
  });
});

describe("policy wiring (L7)", () => {
  const csv = (who: keyof typeof people) =>
    outcome(
      reportRoute(new Request(`${APP}/api/v1/reports/clients.csv`, { headers: people[who] }), {
        params: Promise.resolve({ name: "clients.csv" }),
      }),
    );

  it("CSV exports need data.export: managers and above", async () => {
    expect(await csv("owner")).toBe("ok");
    expect(await csv("admin")).toBe("ok");
    expect(await csv("full")).toBe("forbidden");
    expect(await csv("viewer")).toBe("forbidden");
    as(people.viewer);
    expect(await outcome(exportNoticesCsv({}))).toBe("forbidden");
    as(people.owner);
    expect(await outcome(exportNoticesCsv({}))).toBe("ok");
  });

  it("changing or dismissing a statutory date needs statutory.override", async () => {
    const id = uuidv7();
    await withOrg(database, ctxOwner.orgId, (tx) =>
      tx.insert(deadlines).values({
        id,
        orgId: ctxOwner.orgId,
        clientId: c1,
        source: "statutory",
        title: "GSTR-3B",
        dueOn: "2026-12-20",
        rule: { type: "fixed", date: "2026-12-20" },
        basis: "Statutory calendar",
      }),
    );
    as(people.full);
    expect(
      await outcome(correctDueDate({ deadlineId: id, dueOn: "2026-12-22", reason: "x" })),
    ).toBe("forbidden");
    expect(await outcome(dismissDeadline(id))).toBe("forbidden");
    as(people.owner);
    expect(
      await outcome(correctDueDate({ deadlineId: id, dueOn: "2026-12-22", reason: "x" })),
    ).toBe("ok");
    expect(await outcome(dismissDeadline(id))).toBe("ok");
  });
});

describe("upload integrity (M6)", () => {
  it("the verified original can't be replaced through the upload URL", async () => {
    const bytes = new Uint8Array([...pdf, 0x0a]);
    const ctx = await authorize("document.upload", { headers: people.owner });
    const init = await initUpload(ctx, {
      filename: "again.pdf",
      size: bytes.byteLength,
      mime: "application/pdf",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    if (init.status !== "upload") throw new Error("expected an upload");
    // The URL names an incoming key, never the original's.
    expect(new URL(init.upload.url).searchParams.get("token")).toBeTruthy();
    const send = (b: Uint8Array) =>
      handleLocalStorageRequest(
        container.storage as LocalDiskStorage,
        new Request(init.upload.url, {
          method: "PUT",
          headers: init.upload.headers,
          body: b as BodyInit,
        }),
      );
    expect((await send(bytes)).status).toBe(200);
    // A body of another size is refused outright.
    expect((await send(new Uint8Array(bytes.byteLength + 5))).status).not.toBe(200);
    const done = await completeUpload(ctx, init.documentId);
    expect(done.status).toBe("stored");

    const forged = new Uint8Array(bytes.byteLength).fill(0x25);
    expect((await send(forged)).status).toBe(200); // lands on the incoming key only
    const [d] = await withOrg(database, ctxOwner.orgId, (tx) =>
      tx.select().from(documents).where(eq(documents.id, init.documentId)),
    );
    const stored = await container.storage.get(d?.storageKey as string);
    expect(
      createHash("sha256")
        .update(stored ?? new Uint8Array())
        .digest("hex"),
    ).toBe(d?.sha256);
  });

  it("a size mismatch is quarantined from the object's metadata", async () => {
    const ctx = await authorize("document.upload", { headers: people.owner });
    const init = await initUpload(ctx, {
      filename: "short.pdf",
      size: 64,
      mime: "application/pdf",
      sha256: createHash("sha256").update("short").digest("hex"),
    });
    // Written behind the signed URL's back, as a misbehaving store might allow.
    await container.storage.put(
      `org/${ctxOwner.orgId}/incoming/${init.documentId}`,
      new Uint8Array(65),
    );
    expect(await completeUpload(ctx, init.documentId)).toMatchObject({
      status: "quarantined",
      reason: "size_mismatch",
    });
  });
});
