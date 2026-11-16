import { type ModelPrice, priceFor } from "./prices";
import type { TokenUsage } from "./types";

/**
 * Cost in micro-USD. A price of $X per million tokens is X µ$ per token, so
 * cost = Σ tokens × price. Rounded once, at the end.
 */
export function costMicroUsd(price: ModelPrice, usage: TokenUsage): number {
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const p =
    price.longContext && promptTokens > price.longContext.aboveInputTokens
      ? price.longContext
      : price;
  const raw =
    usage.inputTokens * p.input +
    usage.outputTokens * p.output +
    usage.cacheReadTokens * p.cacheRead +
    usage.cacheWriteTokens * p.cacheWrite;
  return Math.round(raw);
}

/**
 * Cost of a call by model id. Local models and unknown ids cost 0 unless a
 * fallback model id (the one requested) has a price; `unknown` says so.
 */
export function costForModel(
  servedModel: string,
  usage: TokenUsage,
  requestedModel?: string,
): { costMicroUsd: number; unknown: boolean } {
  const served = priceFor(servedModel);
  if (served) return { costMicroUsd: costMicroUsd(served, usage), unknown: false };
  const requested = requestedModel ? priceFor(requestedModel) : undefined;
  if (requested) return { costMicroUsd: costMicroUsd(requested, usage), unknown: true };
  return { costMicroUsd: 0, unknown: true };
}

/** Upper bound for a call before it is made, for the budget check. Rough: 4 characters a token. */
export function estimateMaxCostMicroUsd(
  model: string,
  promptChars: number,
  maxOutputTokens: number,
): number {
  const price = priceFor(model);
  if (!price) return 0;
  return costMicroUsd(price, {
    inputTokens: Math.ceil(promptChars / 3),
    outputTokens: maxOutputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
}
