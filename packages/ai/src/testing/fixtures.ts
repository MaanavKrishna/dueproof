/**
 * Test and eval helpers: the engine lane's recorded responses
 * (services/engine/fixtures/recorded/<fixture>.<endpoint>.json) and a policy
 * builder. Not exported from the package entry.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { engine } from "@dueproof/contracts";
import type { GradedFinding } from "@dueproof/core";
import { type AiPolicy, DEFAULT_EFFORT, DEFAULT_MAX_OUTPUT_TOKENS } from "../policy";
import type { Provider } from "../providers/types";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
export const RECORDED_DIR = join(REPO_ROOT, "services", "engine", "fixtures", "recorded");

export interface EngineRecording {
  name: string;
  read: engine.ReadResponse;
  analyze: engine.AnalyzeResponse;
  link: engine.LinkResponse;
}

export function loadEngineRecording(name: string): EngineRecording {
  const read = (endpoint: string) =>
    JSON.parse(readFileSync(join(RECORDED_DIR, `${name}.${endpoint}.json`), "utf8"));
  return {
    name,
    read: engine.ReadResponse.parse(read("read")),
    analyze: engine.AnalyzeResponse.parse(read("analyze")),
    link: engine.LinkResponse.parse(read("link")),
  };
}

/**
 * Rule findings graded with the engine's recorded link answer. The recorded
 * link request numbers quotes `f0, f1, …` in analyze order.
 */
export function gradedRuleFindings(rec: EngineRecording): GradedFinding[] {
  const byId = new Map(rec.link.matches.map((m) => [m.id, m]));
  return rec.analyze.findings.map((finding, i) => {
    const m = byId.get(`f${i}`);
    const g: GradedFinding = { id: `rule-${i}`, finding, grade: m?.grade ?? "unlocated" };
    if (m?.page !== undefined && m.grade !== "unlocated") g.page = m.page;
    return g;
  });
}

export function testPolicy(overrides: Partial<AiPolicy> = {}, provider?: Provider): AiPolicy {
  return {
    orgId: "org_test",
    mode: "plan",
    provider: provider ? { kind: "fake", provider } : null,
    models: { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" },
    effort: { ...DEFAULT_EFFORT },
    maxOutputTokens: { ...DEFAULT_MAX_OUTPUT_TOKENS },
    haikuExtraction: false,
    sonnetThinkingOff: false,
    monthlyBudgetMicroUsd: null,
    opusCapPercent: 5,
    redactPii: false,
    excludedClientIds: [],
    longOrderPages: 10,
    ocrConfidenceBar: 0.9,
    vocabulary: [],
    usage: { aiCallsThisMonth: 1000, opusCallsThisMonth: 0, spentMicroUsdThisMonth: 0 },
    ...overrides,
  };
}
