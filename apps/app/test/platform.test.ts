/**
 * End to end on the platform, in-process: PGlite, local-disk storage, the
 * fake engine, Better Auth. Sign up (first user owns a new org), upload the
 * GST ASMT-10 fixture through init → signed PUT → complete, run
 * processDocument, and check findings, evidence, deadlines and statuses.
 * Then prove another organisation can't see any of it.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuth } from "@dueproof/auth";
import {
  createDatabase,
  type Database,
  invitation,
  migrate,
  organization,
  uuidv7,
} from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { handleLocalStorageRequest, LocalDiskStorage } from "@dueproof/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as documentEvents } from "../app/api/v1/documents/[id]/events/route";
import { POST as initRoute } from "../app/api/v1/uploads/route";
import { type AuthContext, authorize } from "../lib/authorize";
import { getDocumentDetail } from "../lib/documents";
import { parseEnv } from "../lib/env";
import { type Container, createEngine, setContainer } from "../lib/server/container";
import { completeUpload, initUpload } from "../lib/upload";
import { processDocument } from "../workflows/process-document";

const FIXTURE = new URL(
  "../../../services/engine/tests/fixtures/notice-gst-asmt10.pdf",
  import.meta.url,
);
const APP = "http://localhost:3000";

let dir: string;
let database: Database;
let container: Container;
let pdf: Uint8Array;
let sha: string;

async function signUp(email: string, name: string): Promise<Headers> {
  // Use the session sign-up itself creates, as a browser would.
  const res = await container.auth.api.signUpEmail({
    body: { email, name, password: "a-long-test-password" },
    returnHeaders: true,
  });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return new Headers({ cookie, origin: APP });
}

async function upload(
  ctx: AuthContext,
  bytes: Uint8Array,
  mime = "application/pdf",
  name = "notice.pdf",
) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const init = await initUpload(ctx, {
    filename: name,
    size: bytes.byteLength,
    mime,
    sha256: hash,
    receivedOn: "2026-10-24",
  });
  if (init.status === "upload") {
    const put = await handleLocalStorageRequest(
      container.storage as LocalDiskStorage,
      new Request(init.upload.url, {
        method: "PUT",
        headers: init.upload.headers,
        body: bytes as BodyInit,
      }),
    );
    expect(put.status).toBe(200);
  }
  return init;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "dueproof-app-"));
  pdf = new Uint8Array(await readFile(FIXTURE));
  sha = createHash("sha256").update(pdf).digest("hex");
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
      signupPolicy: "open",
      rateLimit: false,
    }),
    storage,
    engineStorage: storage,
    engine: createEngine(env, storage),
    // Without the Workflow compiler the directives are no-ops, so the workflow runs inline.
    startPipeline: async (ref) => {
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

describe("environment", () => {
  it("names missing variables without echoing values", () => {
    expect(() => parseEnv({ AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
    expect(() => parseEnv({ AUTH_SECRET: "x".repeat(40), DATABASE_DRIVER: "postgres" })).toThrow(
      /DATABASE_URL/,
    );
    const env = parseEnv({
      AUTH_SECRET: "x".repeat(40),
      DUEPROOF_EDITION: "hosted",
      ENGINE_URL: "http://e:8000",
      ENGINE_SHARED_SECRET: "y".repeat(40),
    });
    expect(env.AUTH_SIGNUP).toBe("open");
    expect(env.ENGINE_MODE).toBe("http");
    expect(env.DATABASE_DRIVER).toBe("pglite");
  });
});

describe("sign-up, upload and processing", () => {
  let owner: AuthContext;
  let documentId: string;

  it("the first user owns a new organisation", async () => {
    const headers = await signUp("owner@harbour.test", "Asha");
    owner = await authorize("document.upload", { headers });
    expect(owner.role).toBe("owner");
  });

  it("uploads the ASMT-10 notice and processes it against the fake engine", async () => {
    const init = await upload(owner, pdf);
    expect(init.status).toBe("upload");
    documentId = init.documentId;
    const done = await completeUpload(owner, documentId);
    expect(done).toMatchObject({ status: "stored", runId: `inline-${documentId}` });

    const detail = await getDocumentDetail(owner, documentId);
    expect(detail.document).toMatchObject({
      status: "ready",
      pageCount: 1,
      docType: "in.gst.asmt10",
      reference: "ZD2910260012345",
      issuedOn: "2026-10-20",
      receivedOn: "2026-10-24",
    });
    expect(detail.document).not.toHaveProperty("storageKey");
    expect(detail.findings).toHaveLength(5);
    expect(
      detail.findings.every((f) => f.verification === "exact" && f.evidence.length === 1),
    ).toBe(true);

    const due = detail.deadlines.map((d) => [d.dueOn, d.basis]);
    expect(due).toEqual([
      ["2026-11-18", "On 18 Nov 2026"],
      ["2026-11-23", "30 days from receipt on 24 Oct 2026"],
    ]);
    expect(detail.events.map((e) => e.stage)).toEqual([
      "received",
      "stored",
      "reading",
      "reading",
      "extracting",
      "linking",
      "reconciling",
      "ready",
    ]);

    // Page images were written by the engine through signed PUT URLs.
    const image = await container.storage.get(
      `org/${owner.orgId}/documents/${documentId}/pages/1.webp`,
    );
    expect(image?.byteLength).toBeGreaterThan(0);
  });

  it("dedupes by organisation and sha256", async () => {
    const again = await upload(owner, pdf);
    expect(again).toEqual({ status: "duplicate", documentId });
  });

  it("quarantines a file whose bytes don't match its claimed type", async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const init = await upload(owner, png, "application/pdf", "fake.pdf");
    const done = await completeUpload(owner, init.documentId);
    expect(done).toMatchObject({ status: "quarantined", reason: "type_mismatch" });
    expect(
      await container.storage.head(
        `org/${owner.orgId}/originals/${createHash("sha256").update(png).digest("hex")}`,
      ),
    ).toBeNull();
  });

  it("parks a password-protected PDF as needs_password", async () => {
    const locked = new Uint8Array(
      await readFile(
        new URL(
          "../../../services/engine/tests/fixtures/edge-password-protected.pdf",
          import.meta.url,
        ),
      ),
    );
    const init = await upload(owner, locked, "application/pdf", "locked.pdf");
    await completeUpload(owner, init.documentId);
    const detail = await getDocumentDetail(owner, init.documentId);
    expect(detail.document).toMatchObject({
      status: "needs_password",
      statusDetail: "needs_password",
    });
    expect(detail.findings).toEqual([]);
  });

  it("refuses types outside the allow-list and oversized files", async () => {
    await expect(
      initUpload(owner, { filename: "x.html", size: 10, mime: "text/html", sha256: sha }),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      initUpload(owner, {
        filename: "x.pdf",
        size: 60 * 1024 * 1024,
        mime: "application/pdf",
        sha256: sha,
      }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("streams the final status over SSE", async () => {
    const headers = new Headers({ cookie: await signInCookie("owner@harbour.test") });
    const res = await documentEvents(
      new Request(`${APP}/api/v1/documents/${documentId}/events`, { headers }),
      {
        params: Promise.resolve({ id: documentId }),
      },
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: status");
    expect(text).toContain('"status":"ready"');
  });

  it("route handlers refuse cross-site requests", async () => {
    const cookie = await signInCookie("owner@harbour.test");
    const res = await initRoute(
      new Request(`${APP}/api/v1/uploads`, {
        method: "POST",
        headers: { cookie, origin: "https://evil.test", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(403);
    const anon = await initRoute(
      new Request(`${APP}/api/v1/uploads`, {
        method: "POST",
        headers: { origin: APP },
        body: "{}",
      }),
    );
    expect(anon.status).toBe(401);
  });

  it("a viewer may read but not upload", async () => {
    const raw = unsafeRawDb(database);
    await raw.insert(invitation).values({
      id: uuidv7(),
      organizationId: owner.orgId,
      email: "viewer@harbour.test",
      role: "viewer",
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: owner.userId,
    });
    const headers = await signUp("viewer@harbour.test", "Vik");
    const viewer = await authorize("case.view", { headers });
    expect(viewer.orgId).toBe(owner.orgId);
    expect((await getDocumentDetail(viewer, documentId)).findings).toHaveLength(5);
    await expect(authorize("document.upload", { headers })).rejects.toMatchObject({ status: 403 });
  });

  it("another organisation can't see the document, its findings or its events", async () => {
    const headers = await signUp("someone@northline.test", "Nina");
    const other = await authorize("case.view", { headers });
    expect(other.orgId).not.toBe(owner.orgId);
    await expect(getDocumentDetail(other, documentId)).rejects.toMatchObject({ status: 404 });
    const res = await documentEvents(
      new Request(`${APP}/api/v1/documents/${documentId}/events`, { headers }),
      {
        params: Promise.resolve({ id: documentId }),
      },
    );
    expect(res.status).toBe(404);
    // The same file uploaded by the other org is not a duplicate of org A's.
    const init = await upload(other, pdf);
    expect(init.status).toBe("upload");
    const raw = unsafeRawDb(database);
    expect(await raw.select().from(organization)).toHaveLength(2);
  });
});

async function signInCookie(email: string): Promise<string> {
  const res = await container.auth.api.signInEmail({
    body: { email, password: "a-long-test-password" },
    returnHeaders: true,
  });
  return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}
