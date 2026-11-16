/**
 * OpenAI-compatible adapter (official `openai` SDK 7.x with a base URL):
 * OpenAI, Azure OpenAI, Ollama / vLLM / LM Studio (local mode) and the Vercel
 * AI Gateway's OpenAI-compatible endpoint.
 *
 * Structured output via `response_format: { type: "json_schema", strict }`.
 * Refusals: `message.refusal` or `finish_reason: "content_filter"`.
 * Truncation: `finish_reason: "length"`. No tools are sent.
 */
import OpenAI from "openai";
import type {
  OpenAICompatibleConfig,
  Provider,
  ProviderResult,
  StopKind,
  StructuredRequest,
} from "./types";
import { resolveKey } from "./types";

export const OPENAI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
export const OLLAMA_BASE_URL = "http://localhost:11434/v1";

export function openaiBody(req: StructuredRequest, config: OpenAICompatibleConfig) {
  const strict = config.strictSchema ?? true;
  const maxParam = config.maxTokensParam ?? "max_completion_tokens";
  return {
    model: req.model,
    messages: [
      { role: "system" as const, content: req.system },
      { role: "user" as const, content: req.user },
    ],
    response_format: strict
      ? {
          type: "json_schema" as const,
          json_schema: { name: req.schemaName, schema: req.schema, strict: true },
        }
      : { type: "json_object" as const },
    [maxParam]: req.maxOutputTokens,
    ...(config.reasoningEffort
      ? { reasoning_effort: req.effort === "max" || req.effort === "xhigh" ? "high" : req.effort }
      : {}),
  };
}

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): Provider {
  let client: OpenAI | null = null;
  async function getClient(): Promise<OpenAI> {
    if (client) return client;
    // Local servers accept any key; the SDK insists on one.
    const apiKey = (await resolveKey(config.apiKey)) ?? "local";
    client = new OpenAI({
      apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      ...(config.defaultHeaders ? { defaultHeaders: config.defaultHeaders } : {}),
      ...(config.defaultQuery ? { defaultQuery: config.defaultQuery } : {}),
      timeout: config.timeoutMs ?? 120_000,
      maxRetries: config.maxRetries ?? 2,
      logLevel: "off",
    });
    return client;
  }

  return {
    name: config.name,
    serverFallbacks: false,
    async complete(req: StructuredRequest): Promise<ProviderResult> {
      const c = await getClient();
      const body = openaiBody(
        req,
        config,
      ) as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
      const res = await c.chat.completions.create(body);
      const choice = res.choices[0];
      const msg = choice?.message;
      let stop: StopKind = "other";
      if (msg?.refusal || choice?.finish_reason === "content_filter") stop = "refusal";
      else if (choice?.finish_reason === "length") stop = "max_tokens";
      else if (choice?.finish_reason === "stop") stop = "end";
      const cached = res.usage?.prompt_tokens_details?.cached_tokens ?? 0;
      return {
        stop,
        text: stop === "end" ? (msg?.content ?? null) : null,
        servedModel: res.model || req.model,
        usage: {
          inputTokens: Math.max(0, (res.usage?.prompt_tokens ?? 0) - cached),
          outputTokens: res.usage?.completion_tokens ?? 0,
          cacheReadTokens: cached,
          cacheWriteTokens: 0,
        },
        refusalCategory: null,
      };
    },
  };
}
