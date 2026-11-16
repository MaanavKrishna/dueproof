/**
 * Words and choices for the AI settings, shared by the setup wizard and
 * Settings → AI. Which modes an edition offers mirrors lib/ai-settings.ts:
 * the plan is hosted only; local models are for self-hosted and desktop.
 */
export type Edition = "self-hosted" | "hosted" | "desktop";
export type AiModeId = "off" | "local" | "byok" | "plan";

export interface AiModeOption {
  value: AiModeId;
  label: string;
  description: string;
}

export function aiModeOptions(edition: Edition): Array<AiModeOption & { disabled: boolean }> {
  return [
    {
      value: "off",
      label: "Off",
      description: "Rules only. Nothing leaves your server.",
      disabled: false,
    },
    {
      value: "local",
      label: "Local model",
      description:
        edition === "hosted"
          ? "For self-hosted and desktop installs."
          : "A model on your own network (Ollama, vLLM, LM Studio). Slower; private.",
      disabled: edition === "hosted",
    },
    {
      value: "byok",
      label: "Your own key",
      description: "Anthropic, OpenAI or another provider, billed to you.",
      disabled: false,
    },
    {
      value: "plan",
      label: "Dueproof AI plan (Claude)",
      description:
        edition === "hosted"
          ? "Claude through Dueproof, included in your plan's allowance."
          : "Available on the hosted edition.",
      disabled: edition !== "hosted",
    },
  ];
}

export const PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI" },
  { value: "azure-openai", label: "Azure OpenAI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai-compatible", label: "Other OpenAI-compatible" },
] as const;

export const LOCAL_PROVIDERS = [
  { value: "ollama", label: "Ollama" },
  { value: "vllm", label: "vLLM" },
  { value: "lmstudio", label: "LM Studio" },
] as const;

/** Providers that need an address as well as (or instead of) a key. */
export function needsBaseUrl(mode: AiModeId, provider: string | null): boolean {
  if (mode === "local") return true;
  return provider === "azure-openai" || provider === "openai-compatible";
}
