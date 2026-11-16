/**
 * Build an `AiPolicy` from an `ai_settings` row (packages/db) plus this
 * month's usage. The BYOK key stays encrypted: the provider config gets a
 * function that decrypts it on first use, inside the AI call path.
 */
import { PLAN_MODELS } from "@dueproof/contracts";
import { decryptApiKey } from "./keys";
import {
  type AiPolicy,
  type AiSettingsRow,
  type AiUsage,
  DEFAULT_EFFORT,
  DEFAULT_MAX_OUTPUT_TOKENS,
  usdCentsToMicroUsd,
} from "./policy";
import { ANTHROPIC_GATEWAY_BASE_URL } from "./providers/anthropic";
import { OLLAMA_BASE_URL, OPENAI_GATEWAY_BASE_URL } from "./providers/openai";
import type { KeySource, ProviderConfig } from "./providers/types";
import type { Level } from "./types";

/**
 * Model ids on Vercel AI Gateway, checked against the gateway's public
 * catalogue on 2026-11-16 (dotted versions; ZDR offered on every endpoint
 * listed for Sonnet 5.5). Verify again in M0 alongside ZDR enforcement.
 */
export const GATEWAY_MODELS: Record<Level, string> = {
  haiku: "anthropic/claude-haiku-5.5",
  sonnet: "anthropic/claude-sonnet-5.5",
  opus: "anthropic/claude-opus-5.5",
};

export interface PolicyOptions {
  usage: AiUsage;
  /** AI_KEY_MASTER, loaded with `loadMasterKey()`; needed for BYOK. */
  master?: Buffer;
  /**
   * ANTHROPIC_API_KEY for the plan path: Dueproof's own Claude API key.
   * Preferred: the plan calls the Claude API directly.
   */
  anthropicKey?: KeySource;
  /** AI_GATEWAY_API_KEY: optional alternative plan path through Vercel AI Gateway. */
  gatewayKey?: KeySource;
  /**
   * Plan path through the gateway: `anthropic` (Anthropic-compatible endpoint,
   * keeps structured outputs, effort and caching as direct; default) or
   * `openai` (OpenAI-compatible endpoint). Which features pass through is an M0 check.
   */
  gatewayVia?: "anthropic" | "openai";
  /** Convert `monthly_budget_minor` to µ$. Default: the column holds USD cents. */
  budgetToMicroUsd?: (minor: number) => number;
  vocabulary?: readonly string[];
  haikuExtraction?: boolean;
  sonnetThinkingOff?: boolean;
}

function routingModels(routing: unknown): Partial<Record<Level, string>> {
  if (!routing || typeof routing !== "object") return {};
  const r = routing as Record<string, unknown>;
  const out: Partial<Record<Level, string>> = {};
  for (const level of ["haiku", "sonnet", "opus"] as const) {
    const v = r[level];
    if (typeof v === "string" && v.trim()) out[level] = v.trim();
  }
  return out;
}

/** Fill missing levels from the nearest configured one (local mode usually sets one model). */
function fillLevels(partial: Partial<Record<Level, string>>, fallback?: Record<Level, string>) {
  const any = partial.sonnet ?? partial.haiku ?? partial.opus;
  return {
    haiku: partial.haiku ?? fallback?.haiku ?? any ?? "",
    sonnet: partial.sonnet ?? fallback?.sonnet ?? any ?? "",
    opus: partial.opus ?? fallback?.opus ?? partial.sonnet ?? any ?? "",
  };
}

export function policyFromSettings(row: AiSettingsRow, opts: PolicyOptions): AiPolicy {
  const routing = routingModels(row.routing);
  let provider: ProviderConfig | null = null;
  let models: Record<Level, string> = { ...PLAN_MODELS };

  const byokKey: KeySource | undefined =
    row.encryptedKey && opts.master
      ? () => decryptApiKey(row.encryptedKey as string, row.orgId, opts.master as Buffer)
      : undefined;

  switch (row.mode) {
    case "off":
      break;
    case "plan":
      if (opts.anthropicKey) {
        // Direct Claude API: structured outputs, effort, caching and
        // server-side refusal fallbacks all available.
        provider = {
          kind: "anthropic",
          name: "anthropic",
          apiKey: opts.anthropicKey,
          serverFallbacks: true,
        };
        models = { ...PLAN_MODELS };
        break;
      }
      if (!opts.gatewayKey) break;
      if ((opts.gatewayVia ?? "anthropic") === "anthropic") {
        provider = {
          kind: "anthropic",
          name: "gateway",
          apiKey: opts.gatewayKey,
          baseURL: ANTHROPIC_GATEWAY_BASE_URL,
          serverFallbacks: false,
        };
      } else {
        provider = {
          kind: "openai-compatible",
          name: "gateway",
          apiKey: opts.gatewayKey,
          baseURL: OPENAI_GATEWAY_BASE_URL,
          reasoningEffort: true,
        };
      }
      models = { ...GATEWAY_MODELS };
      break;
    case "byok": {
      if (!byokKey) break;
      const kind = (row.provider ?? "anthropic").toLowerCase();
      if (kind === "anthropic") {
        provider = {
          kind: "anthropic",
          name: "anthropic",
          apiKey: byokKey,
          ...(row.baseUrl ? { baseURL: row.baseUrl } : {}),
          serverFallbacks: !row.baseUrl,
        };
        models = fillLevels(routing, PLAN_MODELS);
      } else {
        provider = {
          kind: "openai-compatible",
          name: kind,
          apiKey: byokKey,
          ...(row.baseUrl ? { baseURL: row.baseUrl } : {}),
          reasoningEffort: kind === "openai" || kind === "azure-openai",
        };
        models = fillLevels(routing);
      }
      break;
    }
    case "local":
      provider = {
        kind: "openai-compatible",
        name: row.provider ?? "local",
        ...(byokKey ? { apiKey: byokKey } : {}),
        baseURL: row.baseUrl ?? OLLAMA_BASE_URL,
        maxTokensParam: "max_tokens",
        reasoningEffort: false,
      };
      models = fillLevels(routing);
      break;
  }
  if (provider && !models.sonnet) provider = null; // no model configured: treat as off

  return {
    orgId: row.orgId,
    mode: row.mode,
    provider,
    models,
    effort: { ...DEFAULT_EFFORT },
    maxOutputTokens: { ...DEFAULT_MAX_OUTPUT_TOKENS },
    haikuExtraction: opts.haikuExtraction ?? false,
    sonnetThinkingOff: opts.sonnetThinkingOff ?? false,
    monthlyBudgetMicroUsd:
      row.monthlyBudgetMinor === null
        ? null
        : (opts.budgetToMicroUsd ?? usdCentsToMicroUsd)(row.monthlyBudgetMinor),
    opusCapPercent: row.opusCapPercent,
    redactPii: row.redactPii,
    excludedClientIds: row.excludedClientIds,
    longOrderPages: 10,
    ocrConfidenceBar: 0.9,
    vocabulary: opts.vocabulary ?? [],
    usage: opts.usage,
  };
}
