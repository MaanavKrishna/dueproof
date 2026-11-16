/**
 * Anthropic adapter (official @anthropic-ai/sdk 1.8): BYOK Anthropic keys and
 * the Dueproof plan through Vercel AI Gateway's Anthropic-compatible endpoint.
 *
 * - Structured outputs: `output_config.format = { type: "json_schema", schema }`.
 * - Prompt caching: `cache_control` on the system block (the stable prefix).
 * - Effort set explicitly on every call (`output_config.effort`).
 * - No tools, no `tool_choice`, no `thinking: disabled`, no sampling parameters.
 *   Thinking stays at the model default (adaptive) except Sonnet's optional
 *   `between_tools`.
 * - `stop_reason` is checked before content: `refusal` and `max_tokens` are
 *   returned as such, never parsed.
 * - Server-side refusal fallbacks (beta `server-side-fallback-2026-07-01`,
 *   `fallbacks: "default"`) for Sonnet/Opus on direct Anthropic keys. Haiku has
 *   none, so a Haiku refusal is stepped up in our code (extract.ts).
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  AnthropicConfig,
  Provider,
  ProviderResult,
  StopKind,
  StructuredRequest,
} from "./types";
import { resolveKey } from "./types";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export const ANTHROPIC_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh";

function stopKind(reason: string | null | undefined): StopKind {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end";
    case "refusal":
      return "refusal";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "max_tokens";
    default:
      return "other";
  }
}

/** Build the request body. Exported for tests (the body is what we promise not to get wrong). */
export function anthropicBody(req: StructuredRequest, serverFallbacks: boolean) {
  const supportsFallback = serverFallbacks && !/haiku/i.test(req.model);
  return {
    model: req.model,
    max_tokens: req.maxOutputTokens,
    system: [
      { type: "text" as const, text: req.system, cache_control: { type: "ephemeral" as const } },
    ],
    messages: [{ role: "user" as const, content: req.user }],
    output_config: {
      effort: req.effort,
      format: { type: "json_schema" as const, schema: req.schema },
    },
    ...(req.thinkingOff && /sonnet/i.test(req.model)
      ? { thinking: { type: "between_tools" as const } }
      : {}),
    ...(supportsFallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
  };
}

export function createAnthropicProvider(config: AnthropicConfig): Provider {
  const serverFallbacks = config.serverFallbacks ?? false;
  let client: Anthropic | null = null;
  async function getClient(): Promise<Anthropic> {
    if (client) return client;
    const apiKey = await resolveKey(config.apiKey);
    client = new Anthropic({
      apiKey: apiKey ?? null,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      timeout: config.timeoutMs ?? 120_000,
      maxRetries: config.maxRetries ?? 2,
      logLevel: "off",
    });
    return client;
  }

  return {
    name: config.name ?? "anthropic",
    serverFallbacks,
    async complete(req: StructuredRequest): Promise<ProviderResult> {
      const c = await getClient();
      const message = await c.beta.messages.create(anthropicBody(req, serverFallbacks));
      const stop = stopKind(message.stop_reason);
      const usage = {
        inputTokens: message.usage.input_tokens ?? 0,
        outputTokens: message.usage.output_tokens ?? 0,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      };
      let text: string | null = null;
      if (stop === "end") {
        // After a server-side fallback there can be more than one text block; the last is the answer.
        for (const block of message.content) if (block.type === "text") text = block.text;
      }
      return {
        stop,
        text,
        servedModel: message.model,
        usage,
        refusalCategory: stop === "refusal" ? (message.stop_details?.category ?? null) : null,
      };
    },
  };
}
