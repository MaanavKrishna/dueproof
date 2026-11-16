import { describe, expect, it } from "vitest";
import { buildPrompts } from "../scripts/build-prompts";
import { costForModel, costMicroUsd } from "./cost";
import { encryptApiKey, generateMasterKey, loadMasterKey } from "./keys";
import { PRICES, priceFor } from "./prices";
import { systemPrompt } from "./prompts";
import { PROMPTS } from "./prompts.generated";
import { anthropicBody } from "./providers/anthropic";
import { openaiBody } from "./providers/openai";
import type { StructuredRequest } from "./providers/types";
import { GATEWAY_MODELS, policyFromSettings } from "./settings";

const req = (over: Partial<StructuredRequest> = {}): StructuredRequest => ({
  feature: "extract",
  level: "sonnet",
  model: "claude-sonnet-5-5",
  effort: "medium",
  maxOutputTokens: 16000,
  system: "SYSTEM",
  user: "USER",
  schemaName: "dueproof_extraction",
  schema: { type: "object" },
  ...over,
});

describe("Anthropic request body", () => {
  it("uses structured outputs, explicit effort and a cached system prefix; no tools, sampling or disabled thinking", () => {
    const body = anthropicBody(req(), true) as Record<string, unknown>;
    expect(body.output_config).toEqual({
      effort: "medium",
      format: { type: "json_schema", schema: { type: "object" } },
    });
    expect(body.system).toEqual([
      { type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } },
    ]);
    expect(body.messages).toEqual([{ role: "user", content: "USER" }]);
    for (const banned of ["tools", "tool_choice", "temperature", "top_p", "top_k", "thinking"]) {
      expect(body[banned]).toBeUndefined();
    }
  });

  it("turns on server-side refusal fallbacks for Sonnet and Opus, never for Haiku", () => {
    expect(anthropicBody(req(), true)).toMatchObject({
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    expect(anthropicBody(req({ model: "claude-opus-5-5", level: "opus" }), true)).toMatchObject({
      fallbacks: "default",
    });
    const haiku = anthropicBody(
      req({ model: "claude-haiku-5-5", level: "haiku", effort: "low" }),
      true,
    ) as Record<string, unknown>;
    expect(haiku.fallbacks).toBeUndefined();
    expect(haiku.betas).toBeUndefined();
    expect((anthropicBody(req(), false) as Record<string, unknown>).fallbacks).toBeUndefined();
  });

  it("sends between_tools only to Sonnet, and never thinking: disabled", () => {
    expect(anthropicBody(req({ thinkingOff: true }), false)).toMatchObject({
      thinking: { type: "between_tools" },
    });
    const opus = anthropicBody(
      req({ thinkingOff: true, model: "claude-opus-5-5" }),
      false,
    ) as Record<string, unknown>;
    expect(opus.thinking).toBeUndefined();
  });
});

describe("OpenAI-compatible request body", () => {
  it("uses strict JSON-schema output and the configured token parameter", () => {
    const body = openaiBody(req({ model: "gpt-5.1" }), {
      kind: "openai-compatible",
      name: "openai",
      reasoningEffort: true,
    });
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "dueproof_extraction", schema: { type: "object" }, strict: true },
    });
    expect(body).toMatchObject({ max_completion_tokens: 16000, reasoning_effort: "medium" });
    expect((body as Record<string, unknown>).tools).toBeUndefined();
    const local = openaiBody(req({ model: "qwen3" }), {
      kind: "openai-compatible",
      name: "ollama",
      maxTokensParam: "max_tokens",
    }) as Record<string, unknown>;
    expect(local.max_tokens).toBe(16000);
    expect(local.reasoning_effort).toBeUndefined();
  });
});

describe("cost (prices are data)", () => {
  const usage = {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  it("matches the list prices per million tokens", () => {
    expect(
      costForModel("claude-haiku-5-5", { ...usage, inputTokens: 90_000, outputTokens: 0 })
        .costMicroUsd,
    ).toBe(9_000);
    expect(costForModel("claude-sonnet-5-5", usage).costMicroUsd).toBe(12_000_000); // $2 + $10
    expect(costForModel("claude-opus-5-5", usage).costMicroUsd).toBe(24_000_000); // $4 + $20
  });

  it("prices cache reads at the provider's discount and cache writes at the write price", () => {
    const sonnet = priceFor("claude-sonnet-5-5");
    expect(sonnet).toBeDefined();
    if (!sonnet) return;
    expect(
      costMicroUsd(sonnet, {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 0,
      }),
    ).toBe(100_000);
    expect(
      costMicroUsd(sonnet, {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 1_000_000,
      }),
    ).toBe(2_500_000);
  });

  it("applies Haiku's long-context price above 100K prompt tokens", () => {
    const small = costForModel("claude-haiku-5-5", {
      inputTokens: 100_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    const big = costForModel("claude-haiku-5-5", {
      inputTokens: 100_001,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(small.costMicroUsd).toBe(10_000);
    expect(big.costMicroUsd).toBe(50_001);
  });

  it("maps gateway ids to the same prices and flags unknown models", () => {
    expect(costForModel("anthropic/claude-sonnet-5.5", usage).costMicroUsd).toBe(12_000_000);
    expect(costForModel("qwen3:32b", usage)).toEqual({ costMicroUsd: 0, unknown: true });
    expect(costForModel("claude-unknown", usage, "claude-opus-5-5")).toEqual({
      costMicroUsd: 24_000_000,
      unknown: true,
    });
  });

  it("marks every price as verify with a source", () => {
    for (const p of Object.values(PRICES)) {
      expect(p.verify).toBe(true);
      expect(p.source.length).toBeGreaterThan(10);
    }
  });
});

describe("prompts", () => {
  it("the generated module is in sync with prompts/*.md", () => {
    expect(JSON.parse(JSON.stringify(PROMPTS))).toEqual(buildPrompts());
  });

  it("every prompt has a version and the extraction prompts carry the data rules", () => {
    for (const level of ["haiku", "sonnet", "opus"] as const) {
      const p = systemPrompt("extract", level);
      expect(p.version).toMatch(new RegExp(`^extract\\.${level}@\\d{4}-\\d{2}-\\d{2}\\.\\d+$`));
      expect(p.text).toContain("<untrusted_document>");
      expect(p.text).toContain("never instructions to you");
      expect(p.text).not.toContain("{{>");
    }
  });

  it("the stable prefix is byte-identical for the same level and vocabulary", () => {
    const a = systemPrompt("extract", "sonnet", ["Finance", "Legal & Compliance"]);
    const b = systemPrompt("extract", "sonnet", ["Finance", "Legal & Compliance"]);
    expect(a.text).toBe(b.text);
    expect(a.text).toContain("- Legal & Compliance");
  });
});

describe("policyFromSettings", () => {
  const usage = { aiCallsThisMonth: 0, opusCallsThisMonth: 0, spentMicroUsdThisMonth: 0 };
  const row = {
    orgId: "org_1",
    mode: "byok" as const,
    provider: "anthropic",
    baseUrl: null,
    encryptedKey: null as string | null,
    routing: null,
    monthlyBudgetMinor: 5_000,
    opusCapPercent: 5,
    redactPii: true,
    excludedClientIds: ["c1"],
  };

  it("BYOK Anthropic: plan models by default, key decrypted lazily, server fallbacks on", async () => {
    const master = loadMasterKey({ AI_KEY_MASTER: generateMasterKey() });
    const enc = encryptApiKey("sk-ant-test-1234", "org_1", master);
    const p = policyFromSettings({ ...row, encryptedKey: enc.ciphertext }, { usage, master });
    expect(p.models).toEqual({
      haiku: "claude-haiku-5-5",
      sonnet: "claude-sonnet-5-5",
      opus: "claude-opus-5-5",
    });
    expect(p.provider).toMatchObject({ kind: "anthropic", serverFallbacks: true });
    const key = p.provider?.kind === "anthropic" ? p.provider.apiKey : undefined;
    expect(typeof key).toBe("function");
    expect(await (key as () => Promise<string>)()).toBe("sk-ant-test-1234");
    expect(p.monthlyBudgetMicroUsd).toBe(50_000_000); // $50.00
    expect(p.redactPii).toBe(true);
  });

  it("BYOK without a key, or off, means no provider", () => {
    expect(policyFromSettings(row, { usage }).provider).toBeNull();
    expect(policyFromSettings({ ...row, mode: "off" }, { usage }).provider).toBeNull();
  });

  it("plan: the Claude API directly when Dueproof's Anthropic key is set, preferred over the gateway", () => {
    const p = policyFromSettings(
      { ...row, mode: "plan" },
      { usage, anthropicKey: "sk-ant-test", gatewayKey: "vck_test" },
    );
    expect(p.provider).toMatchObject({
      kind: "anthropic",
      name: "anthropic",
      serverFallbacks: true,
    });
    expect(p.provider && "baseURL" in p.provider ? p.provider.baseURL : undefined).toBeUndefined();
    expect(p.models).toEqual({
      haiku: "claude-haiku-5-5",
      sonnet: "claude-sonnet-5-5",
      opus: "claude-opus-5-5",
    });
  });

  it("plan: the gateway with dotted model ids, no server fallbacks until verified", () => {
    const p = policyFromSettings({ ...row, mode: "plan" }, { usage, gatewayKey: "vck_test" });
    expect(p.models).toEqual(GATEWAY_MODELS);
    expect(p.provider).toMatchObject({
      kind: "anthropic",
      name: "gateway",
      baseURL: "https://ai-gateway.vercel.sh",
      serverFallbacks: false,
    });
    const viaOpenAI = policyFromSettings(
      { ...row, mode: "plan" },
      { usage, gatewayKey: "vck_test", gatewayVia: "openai" },
    );
    expect(viaOpenAI.provider).toMatchObject({
      kind: "openai-compatible",
      baseURL: "https://ai-gateway.vercel.sh/v1",
    });
  });

  it("local: one model for every level, OpenAI-compatible, no key needed", () => {
    const p = policyFromSettings(
      { ...row, mode: "local", provider: "ollama", routing: { sonnet: "qwen3:32b" } },
      { usage },
    );
    expect(p.models).toEqual({ haiku: "qwen3:32b", sonnet: "qwen3:32b", opus: "qwen3:32b" });
    expect(p.provider).toMatchObject({
      kind: "openai-compatible",
      name: "ollama",
      baseURL: "http://localhost:11434/v1",
      maxTokensParam: "max_tokens",
    });
  });
});
