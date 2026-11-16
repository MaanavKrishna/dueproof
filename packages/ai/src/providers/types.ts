import type { Effort, Feature, Level, TokenUsage } from "../types";

/**
 * One structured-output request. `system` is the stable prefix (cached);
 * `user` holds the volatile part, with document text inside the untrusted
 * block. No tools are ever sent.
 */
export interface StructuredRequest {
  feature: Feature;
  level: Level;
  model: string;
  effort: Effort;
  maxOutputTokens: number;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  /** Sonnet 5.5 only: `thinking: {type: "between_tools"}` (effort high or below). */
  thinkingOff?: boolean;
  /** Fake provider and recordings only: which case this is. Never sent anywhere. */
  caseKey?: string;
}

export type StopKind = "end" | "refusal" | "max_tokens" | "other";

export interface ProviderResult {
  stop: StopKind;
  /** The JSON text of the structured output (null on refusal). */
  text: string | null;
  /** The model that actually served the call (may differ after a server-side fallback). */
  servedModel: string;
  usage: TokenUsage;
  refusalCategory?: string | null;
}

export interface Provider {
  /** Stored in `ai_runs.provider`. */
  readonly name: string;
  /** Whether the provider steps up on refusal itself (Anthropic server-side fallbacks). */
  readonly serverFallbacks: boolean;
  complete(req: StructuredRequest): Promise<ProviderResult>;
}

/** A key, or a function that decrypts it at call time (preferred: decrypt only in the call path). */
export type KeySource = string | (() => string | Promise<string>);

export interface AnthropicConfig {
  kind: "anthropic";
  /** "anthropic" for BYOK, "gateway" for the plan through Vercel AI Gateway. */
  name?: string;
  apiKey: KeySource;
  baseURL?: string;
  /** Server-side refusal fallbacks (beta). Direct Anthropic only; off through the gateway until verified. */
  serverFallbacks?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface OpenAICompatibleConfig {
  kind: "openai-compatible";
  /** "openai", "azure-openai", "ollama", "vllm", "lmstudio", "gateway", … */
  name: string;
  apiKey?: KeySource;
  baseURL?: string;
  /** Send `reasoning_effort` (OpenAI reasoning models, the gateway). Local servers usually ignore or reject it. */
  reasoningEffort?: boolean;
  /** OpenAI's newer models want `max_completion_tokens`; local servers want `max_tokens`. */
  maxTokensParam?: "max_tokens" | "max_completion_tokens";
  /** Use strict JSON-schema output (`response_format.json_schema`). Off → `json_object` and our Zod check only. */
  strictSchema?: boolean;
  defaultHeaders?: Record<string, string>;
  /** Azure OpenAI: `{ "api-version": "…" }`. */
  defaultQuery?: Record<string, string>;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface FakeConfig {
  kind: "fake";
  provider: Provider;
}

export type ProviderConfig = AnthropicConfig | OpenAICompatibleConfig | FakeConfig;

export async function resolveKey(key: KeySource | undefined): Promise<string | undefined> {
  if (key === undefined) return undefined;
  return typeof key === "string" ? key : await key();
}
