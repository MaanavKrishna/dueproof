import { type ModelPrice, priceFor, UNKNOWN_MODEL_PRICE } from "./prices";
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

export interface CostOptions {
  /** Local mode: the model runs on the organisation's own hardware and costs nothing. */
  local?: boolean;
}

/**
 * Cost of a call by model id. A model with no price is charged at the
 * requested model's price when that has one, otherwise at
 * `UNKNOWN_MODEL_PRICE` (the highest in the table), so a monthly budget
 * still holds; `unknown` says the figure is not the model's own. Local
 * models cost 0.
 */
export function costForModel(
  servedModel: string,
  usage: TokenUsage,
  requestedModel?: string,
  opts: CostOptions = {},
): { costMicroUsd: number; unknown: boolean } {
  const served = priceFor(servedModel);
  if (served) return { costMicroUsd: costMicroUsd(served, usage), unknown: false };
  const requested = requestedModel ? priceFor(requestedModel) : undefined;
  if (requested) return { costMicroUsd: costMicroUsd(requested, usage), unknown: true };
  if (opts.local) return { costMicroUsd: 0, unknown: true };
  return { costMicroUsd: costMicroUsd(UNKNOWN_MODEL_PRICE, usage), unknown: true };
}

/**
 * Upper bound for a call before it is made, for the budget check. Rough: 3
 * characters a token. A model with no price is estimated at
 * `UNKNOWN_MODEL_PRICE`, never at 0, unless it is local.
 */
export function estimateMaxCostMicroUsd(
  model: string,
  promptChars: number,
  maxOutputTokens: number,
  opts: CostOptions = {},
): number {
  const price = priceFor(model) ?? (opts.local ? undefined : UNKNOWN_MODEL_PRICE);
  if (!price) return 0;
  return costMicroUsd(price, {
    inputTokens: Math.ceil(promptChars / 3),
    outputTokens: maxOutputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
}
