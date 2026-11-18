/**
 * The AI lane end to end, in-process: PGlite, local-disk storage, the fake
 * engine (the real engine's recordings) and the fake model provider from
 * packages/ai. The board minutes fixture is one the rules aren't confident
 * about, so with AI on a model reads it; its findings are graded by the
 * linker and reconciled with the rules' in packages/core.
 *
 *   BYOK, settings and key through the server actions → a date conflict
 *   (both readings kept), an AI-only located finding (needs review, no
 *   deadline yet), an unlocated AI suggestion (never a deadline), ai_runs rows.
 *   Plan → an agreeing reading is accepted and the document is ready.
 *   Off, or an excluded client → no model call at all.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeProvider, type FakeProvider, generateMasterKey } from "@dueproof/ai";
import { createAuth } from "@dueproof/auth";
import {
  aiRuns,
  aiSettings,
  clients,
  createDatabase,
  type Database,
  eq,
  invitation,
  migrate,
  schema,
  uuidv7,
} from "@dueproof/db";
import { unsafeRawDb } from "@dueproof/db/internal";
import { handleLocalStorageRequest, LocalDiskStorage } from "@dueproof/storage";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clearAiKey, getAiSettings, saveAiSettings, setAiKey } from "../app/actions/ai-settings";
import { type AuthContext, authorize } from "../lib/authorize";
import { getDocumentDetail } from "../lib/documents";
import { parseEnv } from "../lib/env";
import type { HeavyEngine } from "../lib/heavy-engine";
import { aiAssistStage, aiStepKey } from "../lib/pipeline/ai-assist";
import { analyzeStage, linkStage } from "../lib/pipeline/stages";
import { type Container, createEngine, setContainer } from "../lib/server/container";
import { completeUpload, initUpload } from "../lib/upload";
import { processDocument } from "../workflows/process-document";

const fixture = (name: string) =>
  new URL(`../../../services/engine/tests/fixtures/${name}`, import.meta.url);
const APP = "http://localhost:3000";
const KEY = "sk-ant-test-0123456789abcdefWXYZ";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

// The rules' deadline in the minutes, verbatim from the page.
const RULE_DEADLINE =
  "The Board noted that civil works on the Phase II viaduct are 62% complete against a planned 70%, and resolved that the Director (Projects) shall submit a recovery schedule to the Board by 30 September 2026.";

function aiFinding(over: Record<string, unknown>) {
  return {
    kind: "deadline",
    text: "x",
    textEn: null,
    quote: "x",
    quoteLang: "en",
    pageHint: 1,
    confidence: 0.8,
    dueRule: null,
    amountMinor: null,
    desk: null,
    severity: null,
    ...over,
  };
}

let dir: string;
let database: Database;
let container: Container;
let minutes: Uint8Array;
let scan: Uint8Array;
const heavyCalls: string[] = [];

async function signUp(email: string): Promise<AuthContext> {
  const res = await container.auth.api.signUpEmail({
    body: { email, name: email.split("@")[0] ?? "x", password: "a-long-test-password" },
    returnHeaders: true,
  });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const headers = new Headers({ cookie, origin: APP });
  request.headers = headers;
  return authorize("document.upload", { headers });
}

async function processUpload(ctx: AuthContext, bytes: Uint8Array, clientId?: string) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const init = await initUpload(ctx, {
    filename: "doc.pdf",
    size: bytes.byteLength,
    mime: "application/pdf",
    sha256,
    receivedOn: "2026-08-03",
    ...(clientId ? { clientId } : {}),
  });
  if (init.status !== "upload") throw new Error(`unexpected ${init.status}`);
  const put = await handleLocalStorageRequest(
    container.storage as LocalDiskStorage,
    new Request(init.upload.url, {
      method: "PUT",
      headers: init.upload.headers,
      body: bytes as BodyInit,
    }),
  );
  expect(put.status).toBe(200);
  await completeUpload(ctx, init.documentId);
  return getDocumentDetail(ctx, init.documentId);
}

async function runsFor(orgId: string) {
  return unsafeRawDb(database).select().from(aiRuns).where(eq(aiRuns.orgId, orgId));
}

function useProvider(provider: FakeProvider): FakeProvider {
  container.aiProvider = provider;
  return provider;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "dueproof-ai-"));
  minutes = new Uint8Array(await readFile(fixture("minutes-board-87.pdf")));
  scan = new Uint8Array(await readFile(fixture("Scan-circular-photo.pdf")));
  const env = parseEnv({
    NODE_ENV: "test",
    DUEPROOF_EDITION: "hosted",
    APP_URL: APP,
    AUTH_SECRET: "test-auth-secret-test-auth-secret-0123456789",
    STORAGE_LOCAL_DIR: dir,
    AI_KEY_MASTER: generateMasterKey(),
    AI_GATEWAY_API_KEY: "gateway-test-key",
  });
  database = await createDatabase({ driver: "pglite" });
  await migrate(database);
  const storage = new LocalDiskStorage({
    root: dir,
    publicUrl: `${APP}/api/storage/local`,
    secret: env.STORAGE_SIGNING_SECRET,
  });
  // engine-heavy stand-in: records whether the workflow escalated.
  const heavyEngine: HeavyEngine = {
    read: async () => {
      heavyCalls.push("read");
      return { pages: [], needsEscalation: [] };
    },
    translate: async (req) => {
      heavyCalls.push("translate");
      return {
        segments: req.segments.map((s) => ({ id: s.id, textEn: s.text, warn: false })),
        engine: "none",
      };
    },
  } as HeavyEngine;
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
    heavyEngine,
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

describe("AI off", () => {
  it("makes no model call and records no AI step", async () => {
    const owner = await signUp("off@harbour.test");
    const provider = useProvider(createFakeProvider());
    const detail = await processUpload(owner, minutes);
    expect(provider.calls).toHaveLength(0);
    expect(await runsFor(owner.orgId)).toHaveLength(0);
    expect(detail.events.map((e) => e.stage)).not.toContain("ai_assist");
    expect(detail.findings.every((f) => f.origin === "rule")).toBe(true);
    // Rules not confident and no AI: a person looks at it.
    expect(detail.document.status).toBe("needs_review");
  });
});

describe("Settings → AI", () => {
  it("saves settings and the key, returns only the last four characters, and audits each change", async () => {
    const owner = await signUp("settings@harbour.test");
    const saved = await saveAiSettings({
      mode: "byok",
      provider: "anthropic",
      routing: { sonnet: "claude-sonnet-5-5" },
      monthlyBudgetMinor: 5_000,
      opusCapPercent: 10,
      redactPii: true,
    });
    expect(saved).toMatchObject({ ok: true, data: { mode: "byok", keyLast4: null } });

    const set = await setAiKey(KEY);
    expect(set).toEqual({ ok: true, data: { keyLast4: "WXYZ" } });
    const view = await getAiSettings();
    expect(view.ok && view.data).toMatchObject({
      mode: "byok",
      provider: "anthropic",
      routing: { sonnet: "claude-sonnet-5-5" },
      monthlyBudgetMinor: 5_000,
      opusCapPercent: 10,
      redactPii: true,
      keyLast4: "WXYZ",
      canStoreKey: true,
      usage: { calls: 0, opusCalls: 0, costMicroUsd: 0 },
    });
    expect(JSON.stringify(view)).not.toContain(KEY);

    // Stored encrypted; the key appears nowhere in the row or the audit trail.
    const raw = unsafeRawDb(database);
    const [row] = await raw.select().from(aiSettings).where(eq(aiSettings.orgId, owner.orgId));
    expect(row?.encryptedKey).toBeTruthy();
    expect(row?.encryptedKey).not.toContain(KEY);
    const trail = await raw.select().from(schema.audit).where(eq(schema.audit.orgId, owner.orgId));
    expect(trail.map((a) => a.action)).toEqual(
      expect.arrayContaining(["ai.settings_changed", "ai.key_set"]),
    );
    expect(JSON.stringify(trail)).not.toContain(KEY);
    expect(JSON.stringify(trail)).not.toContain("WXYZ");

    expect(await clearAiKey()).toEqual({ ok: true, data: { cleared: true } });
    const after = await getAiSettings();
    expect(after.ok && after.data.keyLast4).toBeNull();
  });

  it("refuses the plan off hosted, local on hosted, plain http and unknown clients", async () => {
    await signUp("rules@harbour.test");
    expect(await saveAiSettings({ mode: "local", baseUrl: "http://10.0.0.5:11434" })).toMatchObject(
      { ok: false, error: "ai_mode" },
    );
    expect(
      await saveAiSettings({ mode: "byok", provider: "openai", baseUrl: "http://api.example.com" }),
    ).toMatchObject({ ok: false, error: "ai_base_url" });
    expect(
      await saveAiSettings({ mode: "byok", excludedClientIds: ["not-a-client"] }),
    ).toMatchObject({ ok: false, error: "unknown_client" });
    expect(await setAiKey("short")).toMatchObject({ ok: false, error: "invalid_key" });
  });

  it("is for owners and admins only", async () => {
    const admin = await authorize("case.view", {
      headers: new Headers({ cookie: await signInCookie("settings@harbour.test") }),
    });
    await unsafeRawDb(database)
      .insert(invitation)
      .values({
        id: uuidv7(),
        organizationId: admin.orgId,
        email: "member@harbour.test",
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 86_400_000),
        inviterId: admin.userId,
      });
    const member = await signUp("member@harbour.test");
    expect(member.orgId).toBe(admin.orgId);
    for (const res of [
      await getAiSettings(),
      await saveAiSettings({ mode: "off" }),
      await setAiKey(KEY),
      await clearAiKey(),
    ])
      expect(res).toMatchObject({ ok: false, error: "forbidden" });
  });
});

describe("BYOK on a notice the rules aren't confident about", () => {
  let owner: AuthContext;
  let provider: FakeProvider;
  let detail: Awaited<ReturnType<typeof getDocumentDetail>>;

  beforeAll(async () => {
    owner = await signUp("byok@harbour.test");
    expect((await saveAiSettings({ mode: "byok", provider: "anthropic" })).ok).toBe(true);
    expect((await setAiKey(KEY)).ok).toBe(true);
    provider = useProvider(
      createFakeProvider({
        script: () => ({
          json: {
            findings: [
              // Same sentence as the rules' deadline, but a different date: a conflict.
              aiFinding({
                text: "Submit a recovery schedule",
                quote: RULE_DEADLINE,
                dueRule: { type: "fixed", date: "2026-10-30" },
              }),
              // On the page, not found by the rules: AI-only, located.
              aiFinding({
                kind: "obligation",
                text: "Re-issue the tender with the amended specification",
                quote:
                  "subject to the tender being re-issued with the amended technical specification",
                dueRule: { type: "relative", anchor: "issue", amount: 14, unit: "days" },
              }),
              // Not on the page: an unverified suggestion.
              aiFinding({
                text: "File the compliance report",
                quote: "The Director shall file the compliance report within 15 days of receipt",
                dueRule: { type: "relative", anchor: "receipt", amount: 15, unit: "days" },
              }),
            ],
          },
        }),
      }),
    );
    detail = await processUpload(owner, minutes);
  });

  it("calls the model and writes one ai_runs row per call, with no document text", async () => {
    expect(provider.calls.length).toBeGreaterThan(0);
    const runs = await runsFor(owner.orgId);
    expect(runs).toHaveLength(provider.calls.length);
    for (const r of runs) {
      expect(r).toMatchObject({
        documentId: detail.document.id,
        feature: "extract",
        provider: "fake",
        outcome: "ok",
      });
      expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.stringify(r)).not.toContain("viaduct");
    }
    // The unlocated suggestion fails the proof gate: retried once, then the
    // step up to Opus is refused by the cap, so it ends in review.
    expect(runs.map((r) => r.escalationReason)).toEqual([null, "proof_gate_failed"]);
    expect(detail.events.filter((e) => e.stage === "ai_assist").map((e) => e.detail)).toEqual([
      "started",
      "sonnet: 3 findings; 2 calls; stopped: opus_cap",
    ]);
  });

  it("a retried ai_assist step replays the stored answer: no second call, no second bill", async () => {
    const ref = { orgId: owner.orgId, documentId: detail.document.id };
    const analysis = await analyzeStage(container, ref, {});
    const link = await linkStage(container, ref, analysis);
    const calls = provider.calls.length;
    const runs = (await runsFor(owner.orgId)).length;
    const first = await aiAssistStage(container, ref, analysis, link, []);
    const again = await aiAssistStage(container, ref, analysis, link, []);
    expect(provider.calls.length).toBe(calls);
    expect(await runsFor(owner.orgId)).toHaveLength(runs);
    expect(again).toEqual(first);
    expect(first.calls).toBe(runs);
    // The stored answer sits under the document, keyed by the step's input.
    const key = aiStepKey(ref, analysis, link, []);
    expect(key).toContain(`/documents/${detail.document.id}/steps/ai_assist-`);
    expect(await container.storage.get(key)).not.toBeNull();
  });

  it("drops an AI date its quote does not state, and keeps the rules' date", () => {
    // The quote says 30 September 2026; the model's 30 October is not written
    // there, so the AI check removes it (house rule 2) and there is nothing to
    // conflict with. The rules' date stands on its own exact evidence.
    const f = detail.findings.find((x) => x.quote === RULE_DEADLINE);
    expect(f).toMatchObject({ origin: "rule+ai", verification: "exact", conflict: null });
    expect(f?.dueRule).toEqual({ type: "fixed", date: "2026-09-30" });
    expect(f?.aiRunId).toBeTruthy();
    expect(detail.deadlines.find((d) => d.findingId === f?.id)).toMatchObject({
      dueOn: "2026-09-30",
    });
  });

  it("an AI-only located finding has its proof but needs review before it is a deadline", () => {
    const f = detail.findings.find((x) => x.kind === "obligation" && x.origin === "ai");
    expect(f).toMatchObject({ verification: "exact", conflict: null });
    expect(f?.evidence).toHaveLength(1);
    expect(detail.deadlines.find((d) => d.findingId === f?.id)).toBeUndefined();
  });

  it("an unlocated AI suggestion is kept but never becomes a deadline", () => {
    const f = detail.findings.find((x) => x.quote.includes("compliance report"));
    expect(f).toMatchObject({ origin: "ai", verification: "unlocated" });
    expect(f?.evidence).toHaveLength(0);
    expect(detail.deadlines.find((d) => d.findingId === f?.id)).toBeUndefined();
  });

  it("sends the document to review", () => {
    expect(detail.document.status).toBe("needs_review");
    // Only the rules' located date; nothing from the model alone.
    expect(detail.deadlines).toHaveLength(1);
  });

  it("counts this month's usage for Settings → AI", async () => {
    request.headers = new Headers({ cookie: await signInCookie("byok@harbour.test") });
    const view = await getAiSettings();
    expect(view.ok && view.data.usage.calls).toBe(provider.calls.length);
  });

  it("never sends an excluded client's document to a model", async () => {
    const clientId = uuidv7();
    await unsafeRawDb(database)
      .insert(clients)
      .values({ id: clientId, orgId: owner.orgId, name: "Private Client" });
    request.headers = new Headers({ cookie: await signInCookie("byok@harbour.test") });
    expect(
      (await saveAiSettings({ mode: "byok", provider: "anthropic", excludedClientIds: [clientId] }))
        .ok,
    ).toBe(true);
    const fresh = useProvider(createFakeProvider());
    // Same file, another client: a different org-scoped upload is needed, so use the scan.
    const d = await processUpload(owner, scan, clientId);
    expect(fresh.calls).toHaveLength(0);
    expect(d.events.find((e) => e.stage === "ai_assist" && e.detail !== "started")?.detail).toMatch(
      /^skipped: client_excluded/,
    );
    // The client is excluded from AI, so the pages below the bar escalate as before.
    expect(heavyCalls).toContain("read");
    heavyCalls.length = 0;
  });
});

describe("Plan mode", () => {
  it("accepts an agreeing reading: the deadline is the date engine's, origin rule+ai", async () => {
    const owner = await signUp("plan@harbour.test");
    expect((await saveAiSettings({ mode: "plan" })).ok).toBe(true);
    const provider = useProvider(
      createFakeProvider({
        script: () => ({
          json: {
            findings: [
              aiFinding({
                text: "Submit a recovery schedule",
                quote: RULE_DEADLINE,
                dueRule: { type: "fixed", date: "2026-09-30" },
              }),
            ],
          },
        }),
      }),
    );
    const detail = await processUpload(owner, minutes);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.model).toBe("anthropic/claude-sonnet-5.5");
    const runs = await runsFor(owner.orgId);
    expect(runs).toMatchObject([{ tier: "sonnet", outcome: "ok", escalationReason: null }]);

    const f = detail.findings.find((x) => x.quote === RULE_DEADLINE);
    expect(f).toMatchObject({ origin: "rule+ai", conflict: null, aiRunId: runs[0]?.id });
    expect(detail.deadlines).toMatchObject([{ findingId: f?.id, dueOn: "2026-09-30" }]);
    expect(detail.document.status).toBe("ready");
  });

  it("leaves pages below the OCR bar for the model instead of engine-heavy", async () => {
    await signInAs("plan@harbour.test");
    const owner = await authorize("document.upload");
    useProvider(createFakeProvider());
    heavyCalls.length = 0;
    const detail = await processUpload(owner, scan);
    expect(heavyCalls).not.toContain("read");
    // Vision OCR isn't built yet: the pages wait for a person.
    expect(detail.document.status).toBe("needs_review");
    expect(
      detail.events.some(
        (e) => e.stage === "ai_assist" && /3 pages await vision OCR/.test(e.detail ?? ""),
      ),
    ).toBe(true);
  });
});

async function signInCookie(email: string): Promise<string> {
  const res = await container.auth.api.signInEmail({
    body: { email, password: "a-long-test-password" },
    returnHeaders: true,
  });
  return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

async function signInAs(email: string) {
  request.headers = new Headers({ cookie: await signInCookie(email), origin: APP });
}
