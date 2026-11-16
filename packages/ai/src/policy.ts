/**
 * An organisation's AI settings as the AI lane needs them (04 §5), and the
 * checks made before every call: mode, per-client exclusion, monthly budget,
 * Opus cap. Enforced here, on the server, not in the UI (05 §9).
 */
import type { AiMode } from "@dueproof/contracts";
import type { ProviderConfig } from "./providers/types";
import type { Effort, Level } from "./types";

export interface AiUsage {
  /** Model calls this calendar month (every `ai_runs` row). */
  aiCallsThisMonth: number;
  /** Calls on the escalation level this month (`ai_runs.tier = 'opus'`). */
  opusCallsThisMonth: number;
  spentMicroUsdThisMonth: number;
}

export interface AiPolicy {
  orgId: string;
  mode: AiMode;
  /** Null when mode is off. */
  provider: ProviderConfig | null;
  /**
   * Model per level. Plan mode fills these from PLAN_MODELS; BYOK from the
   * org's settings (any may be the same model); local mode usually one model for all.
   */
  models: Record<Level, string>;
  effort: Record<Level, Effort>;
  maxOutputTokens: Record<Level, number>;
  /** Haiku does extraction on clean digital notices only once its eval passes (04 §6). */
  haikuExtraction: boolean;
  /** Sonnet with `thinking: {type: "between_tools"}`; only where the eval shows no loss. */
  sonnetThinkingOff: boolean;
  /** Null = no cap. */
  monthlyBudgetMicroUsd: number | null;
  /** Opus calls as a share of all AI calls this month, 0–100. Default 5. */
  opusCapPercent: number;
  redactPii: boolean;
  excludedClientIds: readonly string[];
  /** Orders and judgments longer than this go to Opus after Sonnet. */
  longOrderPages: number;
  /** OCR confidence below this counts as a scan. */
  ocrConfidenceBar: number;
  /** Desk names and other profile vocabulary for the stable prompt prefix. */
  vocabulary: readonly string[];
  usage: AiUsage;
}

export const DEFAULT_EFFORT: Record<Level, Effort> = {
  haiku: "low",
  sonnet: "medium",
  opus: "high",
};
export const DEFAULT_MAX_OUTPUT_TOKENS: Record<Level, number> = {
  haiku: 8_000,
  sonnet: 16_000,
  opus: 16_000,
};

export type SkipReason =
  | "ai_off"
  | "no_provider"
  | "client_excluded"
  | "budget_exceeded"
  | "rules_confident"
  | "opus_cap";

export function isClientExcluded(policy: AiPolicy, clientId: string | null | undefined): boolean {
  return !!clientId && policy.excludedClientIds.includes(clientId);
}

/** Would spending `estimate` more stay within this month's budget? */
export function withinBudget(policy: AiPolicy, spentSoFar: number, estimate: number): boolean {
  if (policy.monthlyBudgetMicroUsd === null) return true;
  return spentSoFar + estimate <= policy.monthlyBudgetMicroUsd;
}

/** Alert thresholds crossed (04 §7: 50/80/100 %). */
export function budgetAlerts(policy: AiPolicy, spent: number): (50 | 80 | 100)[] {
  const cap = policy.monthlyBudgetMicroUsd;
  if (!cap || cap <= 0) return [];
  const pct = (spent / cap) * 100;
  return ([50, 80, 100] as const).filter((t) => pct >= t);
}

/**
 * May one more call go to Opus? Counted strictly: after the call, Opus calls
 * must be at most `opusCapPercent` % of all calls this month. So early in a
 * month (few calls) Opus is not available; the item goes to review instead.
 */
export function opusAllowed(policy: AiPolicy, aiCalls: number, opusCalls: number): boolean {
  if (policy.mode === "local") return true; // no cost; the cap is about spend
  const cap = Math.max(0, Math.min(100, policy.opusCapPercent));
  return (opusCalls + 1) * 100 <= cap * (aiCalls + 1);
}

/** USD cents (as stored in `ai_settings.monthly_budget_minor` when the currency is USD) → µ$. */
export function usdCentsToMicroUsd(cents: number): number {
  return cents * 10_000;
}

export interface AiSettingsRow {
  orgId: string;
  mode: AiMode;
  provider: string | null;
  baseUrl: string | null;
  encryptedKey: string | null;
  routing: unknown;
  monthlyBudgetMinor: number | null;
  opusCapPercent: number;
  redactPii: boolean;
  excludedClientIds: string[];
}
