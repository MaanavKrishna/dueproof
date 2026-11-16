/**
 * One provider call, timed and costed, returning an `ai_runs` record.
 * Errors are caught and recorded as `provider_error` with no message text
 * (provider errors can echo request content); nothing here logs.
 */
import type { AiTier } from "@dueproof/contracts";
import { costForModel } from "./cost";
import type { Provider, ProviderResult, StructuredRequest } from "./providers/types";
import type { AiRunRecord, CallOutcome, EscalationReason } from "./types";

export interface CallContext {
  orgId: string;
  documentId?: string;
  /** `local` in local mode; otherwise the level. */
  tier: AiTier;
  promptVersion: string;
  escalationReason: EscalationReason | null;
  now?: () => number;
}

export interface CallResult {
  result: ProviderResult | null;
  /** HTTP status when the provider threw an API error, for retry decisions. */
  errorStatus?: number;
  run: AiRunRecord;
}

function outcomeOf(r: ProviderResult): CallOutcome {
  switch (r.stop) {
    case "end":
      return "ok";
    case "refusal":
      return "refusal";
    case "max_tokens":
      return "max_tokens";
    default:
      return "schema_invalid";
  }
}

export async function callProvider(
  provider: Provider,
  req: StructuredRequest,
  ctx: CallContext,
): Promise<CallResult> {
  const now = ctx.now ?? (() => performance.now());
  const t0 = now();
  let result: ProviderResult | null = null;
  let errorStatus: number | undefined;
  try {
    result = await provider.complete(req);
  } catch (e) {
    const status = (e as { status?: unknown })?.status;
    if (typeof status === "number") errorStatus = status;
  }
  const latencyMs = result?.latencyMs ?? Math.max(0, Math.round(now() - t0));
  const usage = result?.usage ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const served = result?.servedModel ?? req.model;
  const cost = costForModel(served, usage, req.model);
  const run: AiRunRecord = {
    orgId: ctx.orgId,
    feature: req.feature,
    tier: ctx.tier,
    provider: provider.name,
    model: served,
    promptVersion: ctx.promptVersion,
    inputTokens: usage.inputTokens + usage.cacheWriteTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    costMicroUsd: cost.costMicroUsd,
    latencyMs,
    outcome: result ? outcomeOf(result) : "provider_error",
    escalationReason: ctx.escalationReason,
  };
  if (ctx.documentId !== undefined) run.documentId = ctx.documentId;
  if (cost.unknown && provider.name !== "fake") run.priceUnknown = true;
  const out: CallResult = { result, run };
  if (errorStatus !== undefined) out.errorStatus = errorStatus;
  return out;
}
