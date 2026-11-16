/**
 * Shared types for the AI lane (04-ai). Nothing here carries document text
 * into a log: run records hold counts, ids and outcomes only.
 */
import type { AiTier } from "@dueproof/contracts";

/** The three routes a model call can take (04 §6). `none` means no model runs. */
export type Level = "haiku" | "sonnet" | "opus";

/** The order levels step through. Nothing jumps two steps. */
export const LEVELS: readonly Level[] = ["haiku", "sonnet", "opus"] as const;

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** What a call is for; stored in `ai_runs.feature`. */
export type Feature = "extract" | "summary" | "triage" | "answer" | "draft_reply" | "client_match";

/** Why a call ran on a higher level than the route started on; stored in `ai_runs.escalation_reason`. */
export type EscalationReason =
  | "refusal"
  | "max_tokens"
  | "schema_invalid"
  | "proof_gate_failed"
  | "proof_gate_failed_twice"
  | "date_conflict"
  | "amount_conflict"
  | "long_order";

/** How one provider call ended; stored in `ai_runs.outcome`. */
export type CallOutcome = "ok" | "refusal" | "max_tokens" | "schema_invalid" | "provider_error";

/**
 * One row for `ai_runs` (packages/db/src/schema.ts). The app adds `id`,
 * `orgId` (already here), `documentId` and `createdAt`. No document text.
 */
export interface AiRunRecord {
  orgId: string;
  documentId?: string;
  feature: Feature;
  tier: AiTier;
  provider: string;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** Not a column today; kept for cost checks. Included in `costMicroUsd`. */
  cacheWriteTokens: number;
  costMicroUsd: number;
  latencyMs: number;
  outcome: CallOutcome;
  escalationReason: EscalationReason | null;
  /** True when the model that served the call has no price in the table (cost then uses the requested model's price). */
  priceUnknown?: boolean;
}

export interface TokenUsage {
  /** Uncached input tokens. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}
