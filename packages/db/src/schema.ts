/**
 * The v0.1 schema (03 §8). One schema for Neon, Postgres and PGlite.
 *
 * Rules:
 * - Every tenant table has `org_id`, and indexes lead with it. RLS policies
 *   (migrations/rls.sql) restrict rows to `current_setting('app.org_id')`.
 * - IDs are UUIDv7 text. Auth tables (user, session, account, organization,
 *   member, invitation, passkey, two_factor) are owned by Better Auth and
 *   generated in auth-schema.ts; we reference them by id.
 * - Money is integer minor units (paise) + currency.
 * - finding_edits and audit are append-only (enforced by triggers in rls.sql).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey();
const orgId = () => text("org_id").notNull();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const documentRole = pgEnum("document_role", [
  "notice",
  "reply",
  "acknowledgement",
  "order",
  "appeal",
  "attachment",
  "other",
]);
export const documentStatus = pgEnum("document_status", [
  "received",
  "stored",
  "reading",
  "translating",
  "extracting",
  "ai_assist",
  "linking",
  "reconciling",
  "ready",
  "needs_review",
  "needs_password",
  "failed",
  "quarantined",
]);
export const channel = pgEnum("channel", [
  "upload",
  "email",
  "whatsapp",
  "portal",
  "desktop",
  "import",
]);
export const caseStage = pgEnum("case_stage", [
  "received",
  "gathering",
  "drafting",
  "approval",
  "filed",
  "order",
  "appeal",
  "closed",
]);
export const findingKind = pgEnum("finding_kind", [
  "obligation",
  "deadline",
  "hearing",
  "amount",
  "reference",
  "office",
  "section",
  "summary",
]);
export const origin = pgEnum("origin", ["rule", "ai", "rule+ai", "human"]);
export const verification = pgEnum("verification", ["exact", "strong", "approximate", "unlocated"]);
export const workStatus = pgEnum("work_status", ["open", "done", "dismissed"]);
export const deadlineSource = pgEnum("deadline_source", ["notice", "order", "statutory", "manual"]);
export const registrationKind = pgEnum("registration_kind", [
  "gst",
  "tds",
  "income_tax",
  "roc",
  "other",
]);
export const filingFrequency = pgEnum("filing_frequency", ["monthly", "quarterly", "annual"]);
export const aiMode = pgEnum("ai_mode", ["off", "local", "byok", "plan"]);
export const demandHead = pgEnum("demand_head", ["tax", "interest", "penalty", "fee"]);
export const demandStatus = pgEnum("demand_status", ["open", "paid", "stayed", "dropped"]);
export const aiTier = pgEnum("ai_tier", ["none", "haiku", "sonnet", "opus", "local", "byok"]);

/** Org-level settings that Better Auth's `organization` table doesn't hold. */
export const orgSettings = pgTable("org_settings", {
  orgId: text("org_id").primaryKey(),
  country: text("country").notNull().default("IN"),
  locale: text("locale").notNull().default("en-IN"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  currency: text("currency").notNull().default("INR"),
  /** 4 = April (Indian FY). */
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(4),
  region: text("region").notNull().default("in"),
  workingDays: jsonb("working_days")
    .$type<number[]>()
    .notNull()
    .default(sql`'[1,2,3,4,5,6]'::jsonb`),
  reportLogoKey: text("report_logo_key"),
  escalationDays: jsonb("escalation_days").$type<{ manager: number; partner: number }>(),
  createdAt: createdAt(),
});

export const holidays = pgTable(
  "holidays",
  { orgId: orgId(), day: date("day").notNull(), name: text("name").notNull() },
  (t) => [primaryKey({ columns: [t.orgId, t.day] })],
);

export const clients = pgTable(
  "clients",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    pan: text("pan"),
    cin: text("cin"),
    tan: text("tan"),
    gstins: text("gstins").array().notNull().default(sql`'{}'::text[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    partnerUserId: text("partner_user_id"),
    notes: text("notes"),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("clients_org_name").on(t.orgId, t.name),
    index("clients_org_pan").on(t.orgId, t.pan),
  ],
);

export const registrations = pgTable(
  "registrations",
  {
    id: id(),
    orgId: orgId(),
    clientId: text("client_id").notNull(),
    kind: registrationKind("kind").notNull(),
    identifier: text("identifier").notNull(),
    state: text("state"),
    frequency: filingFrequency("frequency"),
    /** e.g. "qrmp", "composition", "regular". */
    scheme: text("scheme"),
    /** Facts the statutory calendar needs: audit flag, company type, AGM date, … */
    attributes: jsonb("attributes")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
  },
  (t) => [index("registrations_org_client").on(t.orgId, t.clientId)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    orgId: orgId(),
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    role: text("role"),
  },
  (t) => [
    index("contacts_org_client").on(t.orgId, t.clientId),
    index("contacts_org_whatsapp").on(t.orgId, t.whatsapp),
  ],
);

export const cases = pgTable(
  "cases",
  {
    id: id(),
    orgId: orgId(),
    clientId: text("client_id"),
    title: text("title").notNull(),
    noticeType: text("notice_type"),
    authority: text("authority"),
    reference: text("reference"),
    stage: caseStage("stage").notNull().default("received"),
    ownerUserId: text("owner_user_id"),
    approvedByUserId: text("approved_by_user_id"),
    /** Filing proof: acknowledgement / ARN number. */
    filingRef: text("filing_ref"),
    filedOn: date("filed_on"),
    openedAt: createdAt(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    index("cases_org_stage").on(t.orgId, t.stage),
    index("cases_org_client").on(t.orgId, t.clientId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    orgId: orgId(),
    caseId: text("case_id"),
    clientId: text("client_id"),
    role: documentRole("role").notNull().default("notice"),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    pageCount: integer("page_count").notNull().default(0),
    languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
    docType: text("doc_type"),
    title: text("title"),
    reference: text("reference"),
    issuingOffice: text("issuing_office"),
    issuedOn: date("issued_on"),
    receivedOn: date("received_on"),
    /**
     * True when nobody gave the received date and the upload day stands in
     * for it. Deadlines counted from it are flagged "received date assumed:
     * confirm" until a person sets the date.
     */
    receivedOnAssumed: boolean("received_on_assumed").notNull().default(false),
    channel: channel("channel").notNull().default("upload"),
    status: documentStatus("status").notNull().default("received"),
    statusDetail: text("status_detail"),
    uploadedBy: text("uploaded_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("documents_org_sha").on(t.orgId, t.sha256),
    index("documents_org_case").on(t.orgId, t.caseId),
    index("documents_org_status").on(t.orgId, t.status),
  ],
);

export const pages = pgTable(
  "pages",
  {
    orgId: orgId(),
    documentId: text("document_id").notNull(),
    page: integer("page").notNull(),
    width: doublePrecision("width").notNull(),
    height: doublePrecision("height").notNull(),
    imageKey: text("image_key"),
    text: text("text").notNull().default(""),
    /** [{text, rect:[x0,y0,x1,y1], line}] */
    words: jsonb("words").notNull().default(sql`'[]'::jsonb`),
    engine: text("engine"),
    confidence: real("confidence"),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.documentId, t.page] }),
    // Search (01 §4): full text over page text. 'simple' keeps every language's words as written.
    index("pages_text_fts").using("gin", sql`to_tsvector('simple', ${t.text})`),
  ],
);

export const documentEvents = pgTable(
  "document_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: orgId(),
    documentId: text("document_id").notNull(),
    at: createdAt(),
    stage: documentStatus("stage").notNull(),
    detail: text("detail"),
  },
  (t) => [index("document_events_org_doc").on(t.orgId, t.documentId)],
);

export const findings = pgTable(
  "findings",
  {
    id: id(),
    orgId: orgId(),
    documentId: text("document_id").notNull(),
    caseId: text("case_id"),
    kind: findingKind("kind").notNull(),
    ord: integer("ord").notNull().default(0),
    text: text("text").notNull(),
    textEn: text("text_en"),
    quote: text("quote").notNull(),
    quoteLang: text("quote_lang").notNull().default("en"),
    origin: origin("origin").notNull(),
    verification: verification("verification").notNull(),
    confidence: real("confidence").notNull(),
    /** DateRule (packages/contracts) as extracted; dates are computed from it. */
    dueRule: jsonb("due_rule"),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    desk: text("desk"),
    severity: text("severity"),
    status: workStatus("status").notNull().default("open"),
    ownerUserId: text("owner_user_id"),
    /** Set when a person confirmed an AI-only or unlocated finding. */
    confirmedBy: text("confirmed_by"),
    aiRunId: text("ai_run_id"),
    /**
     * When rules and AI disagree on a located finding (04 §4 "conflict: both
     * shown"): the other reading, e.g. `{ source: "ai", field: "due",
     * dueRule, amountMinor, quote, page, reason }`. Null when they agree.
     */
    conflict: jsonb("conflict").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("findings_org_doc").on(t.orgId, t.documentId),
    // One write per document: a second pipeline run can't add the same findings again.
    uniqueIndex("findings_org_doc_ord").on(t.orgId, t.documentId, t.ord),
    index("findings_org_case").on(t.orgId, t.caseId),
    // Search (01 §4): full text over what a finding says and the quote it rests on.
    index("findings_text_fts").using(
      "gin",
      sql`to_tsvector('simple', ${t.text} || ' ' || ${t.quote})`,
    ),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: id(),
    orgId: orgId(),
    findingId: text("finding_id").notNull(),
    documentId: text("document_id").notNull(),
    page: integer("page").notNull(),
    rects: jsonb("rects").$type<[number, number, number, number][]>().notNull(),
    score: real("score").notNull(),
  },
  (t) => [index("evidence_org_finding").on(t.orgId, t.findingId)],
);

/** Append-only: corrections sit beside what was found. */
export const findingEdits = pgTable(
  "finding_edits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: orgId(),
    findingId: text("finding_id").notNull(),
    actorUserId: text("actor_user_id"),
    at: createdAt(),
    field: text("field").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    note: text("note"),
  },
  (t) => [index("finding_edits_org_finding").on(t.orgId, t.findingId)],
);

/** Every due item: from notices, orders, the statutory calendar, or added by hand. */
export const deadlines = pgTable(
  "deadlines",
  {
    id: id(),
    orgId: orgId(),
    clientId: text("client_id"),
    caseId: text("case_id"),
    findingId: text("finding_id"),
    source: deadlineSource("source").notNull(),
    title: text("title").notNull(),
    dueOn: date("due_on").notNull(),
    /** Condonation window end, shown separately. */
    windowEndOn: date("window_end_on"),
    rule: jsonb("rule").notNull(),
    basis: text("basis").notNull(),
    /**
     * The date engine's working beyond `basis`: adjustments (what moved the
     * date), warnings (what a person should look at), window basis, original
     * due date, inputs; for statutory items also the source, verified flag
     * and pack version. Shape: `DeadlineDetail` in the app.
     */
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    /** For statutory items: e.g. "in.gst.gstr3b.monthly:2026-10". Unique per client. */
    statutoryKey: text("statutory_key"),
    status: workStatus("status").notNull().default("open"),
    ownerUserId: text("owner_user_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("deadlines_org_due").on(t.orgId, t.status, t.dueOn),
    uniqueIndex("deadlines_org_client_statkey").on(t.orgId, t.clientId, t.statutoryKey),
    // At most one deadline per finding (null finding ids don't collide).
    uniqueIndex("deadlines_org_finding").on(t.orgId, t.findingId),
  ],
);

/** Demand and computed interest on a case (01 §4). Inputs are kept so workings can be shown. */
export const demands = pgTable(
  "demands",
  {
    id: id(),
    orgId: orgId(),
    caseId: text("case_id").notNull(),
    clientId: text("client_id"),
    findingId: text("finding_id"),
    taxType: text("tax_type").notNull(),
    head: demandHead("head").notNull().default("tax"),
    status: demandStatus("status").notNull().default("open"),
    principalMinor: bigint("principal_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("INR"),
    interestRule: text("interest_rule"),
    inputs: jsonb("inputs"),
    interestMinor: bigint("interest_minor", { mode: "number" }),
    penaltyMinMinor: bigint("penalty_min_minor", { mode: "number" }),
    penaltyMaxMinor: bigint("penalty_max_minor", { mode: "number" }),
    asOf: date("as_of"),
    createdAt: createdAt(),
  },
  (t) => [
    index("demands_org_case").on(t.orgId, t.caseId),
    index("demands_org_client").on(t.orgId, t.clientId),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    orgId: orgId(),
    caseId: text("case_id").notNull(),
    authorUserId: text("author_user_id").notNull(),
    body: text("body").notNull(),
    mentions: text("mentions").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [index("comments_org_case").on(t.orgId, t.caseId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    orgId: orgId(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_org_user").on(t.orgId, t.userId, t.readAt)],
);

/** Saved filter sets for list screens (Notices, Deadlines): personal, or shared with the organisation. */
export const savedViews = pgTable(
  "saved_views",
  {
    id: id(),
    orgId: orgId(),
    userId: text("user_id").notNull(),
    /** Which list: "notices", "deadlines", … */
    screen: text("screen").notNull(),
    name: text("name").notNull(),
    /** FilterBar value: { stage: ["drafting"], owner: ["me"] }, plus an optional search under "q". */
    filters: jsonb("filters").$type<Record<string, string[]>>().notNull(),
    shared: boolean("shared").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("saved_views_org_screen").on(t.orgId, t.screen)],
);

/**
 * The password of a protected PDF, for one processing run (01 §4, 05 §4).
 * AES-256-GCM under a key derived from AUTH_SECRET, with the org and
 * document bound in as AAD. Kept at most 15 minutes and deleted when the run
 * finishes or fails. Shared table so any instance can run the pipeline.
 */
export const documentPasswords = pgTable(
  "document_passwords",
  {
    orgId: orgId(),
    documentId: text("document_id").notNull(),
    ciphertext: text("ciphertext").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.documentId] })],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  orgId: orgId(),
  userId: text("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  keys: jsonb("keys").notNull(),
  createdAt: createdAt(),
});

export const aiSettings = pgTable("ai_settings", {
  orgId: text("org_id").primaryKey(),
  mode: aiMode("mode").notNull().default("off"),
  provider: text("provider"),
  baseUrl: text("base_url"),
  /** Envelope-encrypted with the org data key; never returned by the API. */
  encryptedKey: text("encrypted_key"),
  keyLast4: text("key_last4"),
  /** Per-tier model choice for BYOK: { haiku?: string, sonnet?: string, opus?: string }. */
  routing: jsonb("routing"),
  monthlyBudgetMinor: bigint("monthly_budget_minor", { mode: "number" }),
  opusCapPercent: integer("opus_cap_percent").notNull().default(5),
  redactPii: boolean("redact_pii").notNull().default(false),
  excludedClientIds: text("excluded_client_ids").array().notNull().default(sql`'{}'::text[]`),
});

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: id(),
    orgId: orgId(),
    documentId: text("document_id"),
    feature: text("feature").notNull(),
    tier: aiTier("tier").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
    latencyMs: integer("latency_ms"),
    outcome: text("outcome").notNull(),
    escalationReason: text("escalation_reason"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_runs_org_created").on(t.orgId, t.createdAt)],
);

/** Append-only, hash-chained (05 §2). */
export const audit = pgTable(
  "audit",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: orgId(),
    at: createdAt(),
    actor: text("actor"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    requestId: text("request_id"),
    detail: jsonb("detail"),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
  },
  (t) => [index("audit_org_at").on(t.orgId, t.at)],
);

/** Self-hosted Business licence (08 §5), verified offline. */
export const licence = pgTable("licence", {
  id: text("id").primaryKey().default("current"),
  payload: text("payload").notNull(),
  signature: text("signature").notNull(),
  installedAt: createdAt(),
});

/** Tables with org_id that get an RLS policy. Keep in sync with migrations/rls.sql. */
export const TENANT_TABLES = [
  "org_settings",
  "holidays",
  "clients",
  "registrations",
  "contacts",
  "cases",
  "documents",
  "pages",
  "document_events",
  "findings",
  "evidence",
  "finding_edits",
  "deadlines",
  "demands",
  "comments",
  "notifications",
  "saved_views",
  "document_passwords",
  "push_subscriptions",
  "ai_settings",
  "ai_runs",
  "audit",
] as const;
