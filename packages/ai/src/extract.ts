/**
 * Assisted extraction for the workflow's `ai_assist` step (04 §4, §6).
 *
 *   checks (mode, client exclusion) → route → for each attempt:
 *     budget check → Opus cap check → call → validate → link (proof) →
 *     gate + conflict check against the rules → accept / retry / step up
 *
 * Returns AI findings already graded by the linker, ready for
 * `reconcile(ruleFindings, aiFindings)` in packages/core, plus one run record
 * per call for `ai_runs`. A refusal, an error, the budget or the Opus cap
 * end, at worst, in rules-only output flagged for review.
 */
import type { DocumentRole, engine } from "@dueproof/contracts";
import { type DateContext, type GradedFinding, reconcile } from "@dueproof/core";
import { callProvider } from "./call";
import { estimateMaxCostMicroUsd } from "./cost";
import { type GateResult, gradeFindings, type LinkQuote, linkQuotesFor, proofGate } from "./gate";
import {
  type AiPolicy,
  isClientExcluded,
  opusAllowed,
  type SkipReason,
  withinBudget,
} from "./policy";
import { systemPrompt } from "./prompts";
import { createProvider } from "./providers";
import type { Provider, StructuredRequest } from "./providers/types";
import { createRedactor, restoreDeep } from "./redact";
import { type AttemptVerdict, decideRoute, judgeAttempt, type RouteDecision } from "./routing";
import { EXTRACTION_JSON_SCHEMA, type Issue, validateExtraction } from "./schema";
import type { AiRunRecord, CallOutcome, EscalationReason, Level } from "./types";
import { untrustedBlock } from "./untrusted";

export interface AssistInput {
  documentId?: string;
  /** The document's client, for the per-client exclusion. */
  clientId?: string | null;
  /** Pages as read by the engine (`/v1/read`), in page order. */
  pages: readonly engine.PageText[];
  /** The rules' result (`/v1/analyze`). */
  analyze: Pick<engine.AnalyzeResponse, "confident" | "docType">;
  /** The rule findings, graded by the linker: used to spot date/amount conflicts. */
  ruleFindings: readonly GradedFinding[];
  docRole?: DocumentRole;
  /** The engine's `/v1/link` over the same pages. */
  link: (quotes: LinkQuote[]) => Promise<engine.LinkResponse>;
  /** When known, conflicts are judged on resolved dates, not only on rule shape. */
  dateContext?: DateContext;
  /** Eval/recordings only. */
  caseKey?: string;
}

export type AssistStatus = "skipped" | "done" | "no_result";

export interface AssistResult {
  status: AssistStatus;
  skipped?: SkipReason;
  route: RouteDecision;
  /** Feed to `reconcile()` as the AI side. Empty when skipped or nothing usable came back. */
  aiFindings: GradedFinding[];
  /** The level whose findings were kept. */
  level: Level | null;
  /** True when the item should go to the review queue with a note (cap, budget, refusal, error, unresolved conflict). */
  needsReview: boolean;
  /** Why the run ended where it did, when not a plain accept. */
  stoppedBy?: EscalationReason | "provider_error" | "opus_cap" | "budget_exceeded";
  /** The escalation the cap or budget prevented (e.g. `date_conflict`): show both readings for review. */
  blockedEscalation?: EscalationReason;
  /** One per model call, for `ai_runs`. */
  runs: AiRunRecord[];
  /** Counts only; no document text. */
  stats: { rejected: number; issues: Partial<Record<Issue, number>>; gate?: GateResult };
}

export interface AssistDeps {
  /** Override the provider (tests, eval). Default: built from `policy.provider`. */
  provider?: Provider;
  now?: () => number;
  /** Safety bound on calls per document. Default 5. */
  maxCalls?: number;
  /**
   * Eval only: run this level regardless of the route (even when the rules are
   * confident) and accept its first usable answer, no retry or escalation.
   */
  forceLevel?: Level;
}

const INSTRUCTION =
  "Read the document in the untrusted block below and return its findings as JSON matching the schema.";

function buildUserTurn(pages: readonly { page: number; text: string }[]): string {
  return `${INSTRUCTION}\nThe document has ${pages.length} page(s).\n\n${untrustedBlock(pages)}`;
}

function hasConflicts(
  rules: readonly GradedFinding[],
  ai: readonly GradedFinding[],
  ctx: DateContext | undefined,
): { date: boolean; amount: boolean } {
  const opts = ctx ? { dateContext: ctx } : {};
  const { findings } = reconcile(rules, ai, opts);
  let date = false;
  let amount = false;
  for (const f of findings)
    for (const c of f.conflicts) {
      if (c.field === "due") date = true;
      else amount = true;
    }
  return { date, amount };
}

export async function assistExtraction(
  input: AssistInput,
  policy: AiPolicy,
  deps: AssistDeps = {},
): Promise<AssistResult> {
  const route = decideRoute(
    {
      rulesConfident: input.analyze.confident,
      pages: input.pages,
      ...(input.docRole ? { docRole: input.docRole } : {}),
      ...(input.analyze.docType ? { docType: input.analyze.docType } : {}),
    },
    policy,
  );
  const empty = (skipped: SkipReason): AssistResult => ({
    status: "skipped",
    skipped,
    route,
    aiFindings: [],
    level: null,
    needsReview: false,
    runs: [],
    stats: { rejected: 0, issues: {} },
  });

  if (policy.mode === "off") return empty("ai_off");
  if (!policy.provider && !deps.provider) return empty("no_provider");
  if (isClientExcluded(policy, input.clientId)) return empty("client_excluded");
  if (route.level === null && !deps.forceLevel)
    return empty(route.reasons.includes("ai_off") ? "ai_off" : "rules_confident");

  const provider =
    deps.provider ?? createProvider(policy.provider as NonNullable<AiPolicy["provider"]>);
  const maxCalls = deps.maxCalls ?? 5;

  // Redaction is per call and reversible; the mapping never leaves this function.
  const redactor = policy.redactPii ? createRedactor() : null;
  const sentPages = input.pages.map((p) => ({
    page: p.page,
    text: redactor ? redactor.redact(p.text) : p.text,
  }));
  const user = buildUserTurn(sentPages);

  const runs: AiRunRecord[] = [];
  let aiCalls = policy.usage.aiCallsThisMonth;
  let opusCalls = policy.usage.opusCallsThisMonth;
  let spent = policy.usage.spentMicroUsdThisMonth;

  let level: Level = deps.forceLevel ?? (route.level as Level);
  let reason: EscalationReason | null = null;
  let retriedHere = false;
  let gateFailures = 0;
  let kept: { level: Level; findings: GradedFinding[]; gate: GateResult } | null = null;
  let rejected = 0;
  const issues: Partial<Record<Issue, number>> = {};
  let stoppedBy: AssistResult["stoppedBy"];
  let needsReview = false;
  let accepted = false;
  let blockedEscalation: EscalationReason | undefined;

  for (let call = 0; call < maxCalls; call++) {
    const model = policy.models[level];
    const sys = systemPrompt("extract", level, policy.vocabulary);
    const req: StructuredRequest = {
      feature: "extract",
      level,
      model,
      effort: policy.effort[level],
      maxOutputTokens:
        policy.maxOutputTokens[level] * (retriedHere && reason === "max_tokens" ? 2 : 1),
      system: sys.text,
      user,
      schemaName: "dueproof_extraction",
      schema: EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
      ...(level === "sonnet" && policy.sonnetThinkingOff ? { thinkingOff: true } : {}),
      ...(input.caseKey ? { caseKey: input.caseKey } : {}),
    };

    const estimate = estimateMaxCostMicroUsd(
      model,
      sys.text.length + user.length,
      req.maxOutputTokens,
    );
    if (!withinBudget(policy, spent, estimate)) {
      blockedEscalation = reason ?? undefined;
      stoppedBy = "budget_exceeded";
      needsReview = true;
      break;
    }
    if (level === "opus" && !opusAllowed(policy, aiCalls, opusCalls)) {
      blockedEscalation = reason ?? undefined;
      stoppedBy = "opus_cap";
      needsReview = true;
      break;
    }

    const { result, run } = await callProvider(provider, req, {
      orgId: policy.orgId,
      ...(input.documentId ? { documentId: input.documentId } : {}),
      tier: policy.mode === "local" ? "local" : level,
      promptVersion: sys.version,
      escalationReason: reason,
      ...(deps.now ? { now: deps.now } : {}),
    });
    runs.push(run);
    aiCalls++;
    if (level === "opus") opusCalls++;
    spent += run.costMicroUsd;

    let outcome: CallOutcome = run.outcome;
    let graded: GradedFinding[] = [];
    let gate: GateResult = { failed: false, located: 0, total: 0, unlocatedKeyFindings: 0 };
    if (outcome === "ok" && result?.text) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.text);
      } catch {
        parsed = undefined;
      }
      const restored = redactor ? restoreDeep(parsed, redactor.mapping) : parsed;
      const v = validateExtraction(restored, { level, pageCount: input.pages.length });
      if (!v.ok) {
        outcome = "schema_invalid";
        run.outcome = "schema_invalid";
      } else {
        rejected += v.rejected.length;
        for (const f of v.findings) for (const i of f.issues) issues[i] = (issues[i] ?? 0) + 1;
        const link =
          v.findings.length > 0 ? await input.link(linkQuotesFor(v.findings)) : { matches: [] };
        graded = gradeFindings(v.findings, link);
        gate = proofGate(graded);
      }
    } else if (outcome === "ok") {
      outcome = "schema_invalid";
      run.outcome = "schema_invalid";
    }

    if (gate.failed) gateFailures++;
    const conflicts =
      outcome === "ok" && !gate.failed
        ? hasConflicts(input.ruleFindings, graded, input.dateContext)
        : { date: false, amount: false };
    // Keep the newest usable reading, unless it failed the gate and an earlier one did not.
    if (outcome === "ok" && (!kept || !gate.failed || kept.gate.failed))
      kept = { level, findings: graded, gate };

    const verdict: AttemptVerdict = deps.forceLevel
      ? outcome === "ok"
        ? { action: "accept" }
        : { action: "stop", reason: outcome === "refusal" ? "refusal" : "provider_error" }
      : judgeAttempt({
          level,
          outcome,
          retriedHere,
          gateFailures,
          gateFailed: gate.failed,
          dateConflict: conflicts.date,
          amountConflict: conflicts.amount,
          longOrder: route.longOrder,
          serverFallbacks: provider.serverFallbacks,
        });

    if (verdict.action === "accept") {
      accepted = true;
      stoppedBy = undefined;
      blockedEscalation = undefined;
      break;
    }
    if (verdict.action === "stop") {
      stoppedBy = verdict.reason;
      // A conflict or gate problem at the top stays visible: reconcile marks it for review.
      needsReview = true;
      break;
    }
    if (verdict.action === "retry") {
      reason = verdict.reason;
      retriedHere = true;
      continue;
    }
    level = verdict.to;
    reason = verdict.reason;
    retriedHere = false;
  }

  return {
    status: kept ? "done" : "no_result",
    route,
    aiFindings: kept?.findings ?? [],
    level: kept?.level ?? null,
    needsReview: needsReview || !accepted || !kept,
    ...(stoppedBy ? { stoppedBy } : {}),
    ...(blockedEscalation ? { blockedEscalation } : {}),
    runs,
    stats: { rejected, issues, ...(kept ? { gate: kept.gate } : {}) },
  };
}
