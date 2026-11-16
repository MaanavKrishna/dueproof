import { createAnthropicProvider } from "./anthropic";
import { createOpenAICompatibleProvider } from "./openai";
import type { Provider, ProviderConfig } from "./types";

export * from "./anthropic";
export * from "./fake";
export * from "./openai";
export * from "./types";

export function createProvider(config: ProviderConfig): Provider {
  switch (config.kind) {
    case "anthropic":
      return createAnthropicProvider(config);
    case "openai-compatible":
      return createOpenAICompatibleProvider(config);
    case "fake":
      return config.provider;
  }
}
