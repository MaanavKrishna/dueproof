/**
 * The other features (04 §3): summary, triage, Ask, reply drafts. Each is one
 * structured call on a fixed level (routing.levelForFeature), with the same
 * checks as extraction (exclusion, budget, untrusted blocks, schema-only
 * output) and its own gate:
 *   summary — every bullet must cite a finding id; uncited bullets are dropped;
 *   answer  — an answer without valid citations is refused;
 *   draft   — always labelled "Draft — review before sending";
 *   triage  — identifiers must appear verbatim on the page; suggestions only.
 * A Haiku refusal or invalid output steps up once to Sonnet.
 */
import { DocumentRole, type engine } from "@dueproof/contracts";
import { z } from "zod";
import { callProvider } from "./call";
import { estimateMaxCostMicroUsd } from "./cost";
import { type AiPolicy, isClientExcluded, type SkipReason, withinBudget } from "./policy";
import { systemPrompt } from "./prompts";
import { createProvider } from "./providers";
import type { Provider } from "./providers/types";
import { levelForFeature, nextLevel } from "./routing";
import type { AiRunRecord, EscalationReason, Feature, Level } from "./types";
import { dataBlock, untrustedBlock } from "./untrusted";

export interface FeatureDeps {
  provider?: Provider;
  now?: () => number;
}

export interface FeatureResult<T> {
  /** Null when skipped, refused, or nothing valid came back. */
  value: T | null;
  skipped?: SkipReason;
  runs: AiRunRecord[];
}

interface FeatureCall<T> {
  feature: Exclude<Feature, "extract">;
  clientId?: string | null;
  documentId?: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  parse: (raw: unknown) => T | null;
}

async function runFeature<T>(
  policy: AiPolicy,
  call: FeatureCall<T>,
  deps: FeatureDeps,
): Promise<FeatureResult<T>> {
  if (policy.mode === "off") return { value: null, skipped: "ai_off", runs: [] };
  if (!policy.provider && !deps.provider) return { value: null, skipped: "no_provider", runs: [] };
  if (isClientExcluded(policy, call.clientId))
    return { value: null, skipped: "client_excluded", runs: [] };
  const provider =
    deps.provider ?? createProvider(policy.provider as NonNullable<AiPolicy["provider"]>);
  const runs: AiRunRecord[] = [];
  let spent = policy.usage.spentMicroUsdThisMonth;
  let level: Level | null = levelForFeature(call.feature);
  let reason: EscalationReason | null = null;

  while (level && level !== "opus") {
    const sys = systemPrompt(call.feature, level, policy.vocabulary);
    const model = policy.models[level];
    const maxOutputTokens = Math.min(policy.maxOutputTokens[level], 8_000);
    const estimate = estimateMaxCostMicroUsd(
      model,
      sys.text.length + call.user.length,
      maxOutputTokens,
    );
    if (!withinBudget(policy, spent, estimate))
      return { value: null, skipped: "budget_exceeded", runs };
    const { result, run } = await callProvider(
      provider,
      {
        feature: call.feature,
        level,
        model,
        effort: policy.effort[level],
        maxOutputTokens,
        system: sys.text,
        user: call.user,
        schemaName: call.schemaName,
        schema: call.schema,
      },
      {
        orgId: policy.orgId,
        ...(call.documentId ? { documentId: call.documentId } : {}),
        tier: policy.mode === "local" ? "local" : level,
        promptVersion: sys.version,
        escalationReason: reason,
        ...(deps.now ? { now: deps.now } : {}),
      },
    );
    runs.push(run);
    spent += run.costMicroUsd;
    let value: T | null = null;
    if (run.outcome === "ok" && result?.text) {
      try {
        value = call.parse(JSON.parse(result.text));
      } catch {
        value = null;
      }
      if (value === null) run.outcome = "schema_invalid";
    }
    if (value !== null) return { value, runs };
    if (run.outcome === "provider_error" || level !== "haiku") break;
    reason =
      run.outcome === "refusal"
        ? "refusal"
        : run.outcome === "max_tokens"
          ? "max_tokens"
          : "schema_invalid";
    level = nextLevel(level);
  }
  return { value: null, runs };
}

// ------------------------------------------------------------------ summary

export interface SummaryFinding {
  id: string;
  kind: string;
  text: string;
  /** The computed date and its basis from the date engine, if any (never from a model). */
  due?: string;
  amountMinor?: number;
}

export interface SummaryBullet {
  text: string;
  cites: string[];
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    bullets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          cites: { type: "array", items: { type: "string" } },
        },
        required: ["text", "cites"],
        additionalProperties: false,
      },
    },
  },
  required: ["bullets"],
  additionalProperties: false,
};

const SummaryOut = z.strictObject({
  bullets: z.array(
    z.strictObject({ text: z.string().min(1).max(500), cites: z.array(z.string()) }),
  ),
});

export async function summarise(
  input: { findings: readonly SummaryFinding[]; clientId?: string | null; documentId?: string },
  policy: AiPolicy,
  deps: FeatureDeps = {},
): Promise<FeatureResult<SummaryBullet[]>> {
  const ids = new Set(input.findings.map((f) => f.id));
  const call: FeatureCall<SummaryBullet[]> = {
    feature: "summary",
    user: `Summarise these verified findings.\n\n${dataBlock("findings", JSON.stringify(input.findings, null, 1))}`,
    schemaName: "dueproof_summary",
    schema: SUMMARY_SCHEMA,
    parse: (raw) => {
      const p = SummaryOut.safeParse(raw);
      if (!p.success) return null;
      return p.data.bullets
        .map((b) => ({ text: b.text, cites: b.cites.filter((c) => ids.has(c)) }))
        .filter((b) => b.cites.length > 0)
        .slice(0, 5);
    },
  };
  if (input.clientId !== undefined) call.clientId = input.clientId;
  if (input.documentId) call.documentId = input.documentId;
  return runFeature(policy, call, deps);
}

// ------------------------------------------------------------------ answer (Ask)

export interface Passage {
  id: string;
  text: string;
}

export type Answer = { refused: false; answer: string; cites: string[] } | { refused: true };

const ANSWER_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" }, cites: { type: "array", items: { type: "string" } } },
  required: ["answer", "cites"],
  additionalProperties: false,
};
const AnswerOut = z.strictObject({ answer: z.string().max(4000), cites: z.array(z.string()) });

export async function answer(
  input: { question: string; retrieved: readonly Passage[]; clientId?: string | null },
  policy: AiPolicy,
  deps: FeatureDeps = {},
): Promise<FeatureResult<Answer>> {
  const ids = new Set(input.retrieved.map((p) => p.id));
  const passages = input.retrieved
    .map((p) => `<passage id="${p.id.replace(/[^\w:.-]/g, "")}">\n${p.text}\n</passage>`)
    .join("\n");
  const call: FeatureCall<Answer> = {
    feature: "answer",
    user: `${dataBlock("question", input.question)}\n\n${dataBlock("passages", passages)}`,
    schemaName: "dueproof_answer",
    schema: ANSWER_SCHEMA,
    parse: (raw) => {
      const p = AnswerOut.safeParse(raw);
      if (!p.success) return null;
      const cites = p.data.cites.filter((c) => ids.has(c));
      if (!p.data.answer.trim() || cites.length === 0) return { refused: true };
      return { refused: false, answer: p.data.answer, cites };
    },
  };
  if (input.clientId !== undefined) call.clientId = input.clientId;
  return runFeature(policy, call, deps);
}

// ------------------------------------------------------------------ reply drafts

export const DRAFT_LABEL = "Draft — review before sending";

export interface Draft {
  label: typeof DRAFT_LABEL;
  subject: string;
  body: string;
}

const DRAFT_SCHEMA = {
  type: "object",
  properties: { subject: { type: "string" }, body: { type: "string" } },
  required: ["subject", "body"],
  additionalProperties: false,
};
const DraftOut = z.strictObject({
  subject: z.string().max(300),
  body: z.string().min(1).max(20_000),
});

export async function draftReply(
  input: {
    pages: readonly { page: number; text: string }[];
    findings: readonly SummaryFinding[];
    template?: string;
    clientId?: string | null;
    documentId?: string;
  },
  policy: AiPolicy,
  deps: FeatureDeps = {},
): Promise<FeatureResult<Draft>> {
  const parts = [
    "Draft a reply to the notice below.",
    untrustedBlock(input.pages),
    dataBlock("findings", JSON.stringify(input.findings, null, 1)),
  ];
  if (input.template) parts.push(dataBlock("template", input.template));
  const call: FeatureCall<Draft> = {
    feature: "draft_reply",
    user: parts.join("\n\n"),
    schemaName: "dueproof_draft",
    schema: DRAFT_SCHEMA,
    parse: (raw) => {
      const p = DraftOut.safeParse(raw);
      return p.success ? { label: DRAFT_LABEL, ...p.data } : null;
    },
  };
  if (input.clientId !== undefined) call.clientId = input.clientId;
  if (input.documentId) call.documentId = input.documentId;
  return runFeature(policy, call, deps);
}

// ------------------------------------------------------------------ triage

export interface Triage {
  docRole: DocumentRole;
  noticeType: string | null;
  languages: string[];
  /** Only identifiers found verbatim on the page. */
  identifiers: { type: "gstin" | "pan" | "reference"; value: string }[];
}

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    docRole: { type: "string", enum: DocumentRole.options },
    noticeType: { anyOf: [{ type: "string" }, { type: "null" }] },
    languages: { type: "array", items: { type: "string" } },
    identifiers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["gstin", "pan", "reference"] },
          value: { type: "string" },
        },
        required: ["type", "value"],
        additionalProperties: false,
      },
    },
  },
  required: ["docRole", "noticeType", "languages", "identifiers"],
  additionalProperties: false,
};
const TriageOut = z.strictObject({
  docRole: DocumentRole,
  noticeType: z.string().max(120).nullable(),
  languages: z.array(z.string().max(16)).max(10),
  identifiers: z
    .array(
      z.strictObject({ type: z.enum(["gstin", "pan", "reference"]), value: z.string().max(64) }),
    )
    .max(20),
});

export async function triage(
  input: {
    firstPage: Pick<engine.PageText, "page" | "text">;
    clientId?: string | null;
    documentId?: string;
  },
  policy: AiPolicy,
  deps: FeatureDeps = {},
): Promise<FeatureResult<Triage>> {
  const pageText = input.firstPage.text;
  const call: FeatureCall<Triage> = {
    feature: "triage",
    user: `Sort this document.\n\n${untrustedBlock([input.firstPage])}`,
    schemaName: "dueproof_triage",
    schema: TRIAGE_SCHEMA,
    parse: (raw) => {
      const p = TriageOut.safeParse(raw);
      if (!p.success) return null;
      return {
        ...p.data,
        identifiers: p.data.identifiers.filter(
          (i) => i.value.length >= 4 && pageText.includes(i.value),
        ),
      };
    },
  };
  if (input.clientId !== undefined) call.clientId = input.clientId;
  if (input.documentId) call.documentId = input.documentId;
  return runFeature(policy, call, deps);
}
