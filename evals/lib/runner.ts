/**
 * Run the eval for a set of routes in recorded or live mode.
 *
 * recorded: the fake provider replays evals/recordings/<level>/<case>.json.
 *           Token counts are estimated from the real prompt sizes (4 chars a
 *           token), so cost is an estimate; latency is the recorded value.
 * live:     real calls through the Anthropic adapter (needs ANTHROPIC_API_KEY).
 *           `record: true` writes each answer back as a recording.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  type AiPolicy,
  assistExtraction,
  createAnthropicProvider,
  createFakeProvider,
  type FakeResponse,
  type Level,
  type Provider,
  type ProviderResult,
  type StructuredRequest,
} from "../../packages/ai/src/index";
import { testPolicy } from "../../packages/ai/src/testing/fixtures";
import { type EvalCase, loadRecordingFile, type RecordingFile, recordingPath } from "./cases";
import { evalLink } from "./link";
import { type CaseScore, type RouteSummary, scoreCase, summarise } from "./metrics";

export const ROUTES = ["rules", "haiku", "sonnet", "opus", "routed", "routed_haiku"] as const;
export type RouteName = (typeof ROUTES)[number];

export const ROUTE_DESCRIPTIONS: Record<RouteName, string> = {
  rules: "Rules only (no model): the baseline",
  haiku: "Haiku 5.5 on every notice, no escalation",
  sonnet: "Sonnet 5.5 on every notice, no escalation",
  opus: "Opus 5.5 on every notice, no escalation",
  routed: "The router as shipped: no model when rules are confident, Sonnet otherwise, escalation to Opus",
  routed_haiku: "The router with Haiku enabled for clean digital notices",
};

export type Mode = "recorded" | "live";

export interface EvalOptions {
  mode: Mode;
  routes: readonly RouteName[];
  cases: readonly EvalCase[];
  record?: boolean;
  /** Live mode: the API key (never logged). */
  apiKey?: string;
}

export interface EvalReport {
  generatedAt: string;
  mode: Mode;
  cases: string[];
  routes: RouteSummary[];
  perCase: Record<string, CaseScore[]>;
  notes: string[];
}

function recordedProvider(): Provider {
  const recordings = new Map<string, FakeResponse>();
  return createFakeProvider({
    name: "recorded",
    script: (req) => {
      const key = `${req.level}/${req.caseKey}`;
      if (!recordings.has(key)) {
        const file = req.caseKey ? loadRecordingFile(req.level, req.caseKey) : undefined;
        if (!file) return { stop: "other" }; // no recording: counts as schema_invalid
        const r: FakeResponse = { stop: file.stop ?? "end" };
        if (file.json !== undefined) r.json = file.json;
        if (file.text !== undefined) r.text = file.text;
        if (file.usage) r.usage = file.usage;
        if (file.latencyMs !== undefined) r.latencyMs = file.latencyMs;
        recordings.set(key, r);
      }
      return recordings.get(key);
    },
  });
}

/** Wrap a live provider so each answer is written back as a recording. */
function recordingProvider(inner: Provider): Provider {
  return {
    name: inner.name,
    serverFallbacks: inner.serverFallbacks,
    async complete(req: StructuredRequest): Promise<ProviderResult> {
      const t0 = performance.now();
      const result = await inner.complete(req);
      if (req.caseKey) {
        let json: unknown;
        try {
          json = result.text ? JSON.parse(result.text) : undefined;
        } catch {
          json = undefined;
        }
        const file: RecordingFile = {
          source: "live",
          model: result.servedModel,
          recordedAt: new Date().toISOString(),
          latencyMs: Math.round(performance.now() - t0),
          stop: result.stop,
          usage: result.usage,
          ...(json !== undefined ? { json } : result.text ? { text: result.text } : {}),
        };
        const path = recordingPath(req.level, req.caseKey);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
      }
      return result;
    },
  };
}

function policyFor(route: RouteName, provider: Provider): AiPolicy {
  return testPolicy(
    {
      orgId: "eval",
      haikuExtraction: route === "routed_haiku",
      // A busy month, so the Opus cap reflects steady state rather than day one.
      usage: { aiCallsThisMonth: 1000, opusCallsThisMonth: 0, spentMicroUsdThisMonth: 0 },
    },
    provider,
  );
}

const FORCED: Partial<Record<RouteName, Level>> = { haiku: "haiku", sonnet: "sonnet", opus: "opus" };

export async function runEval(opts: EvalOptions): Promise<EvalReport> {
  let provider: Provider;
  if (opts.mode === "live") {
    if (!opts.apiKey) throw new Error("live mode needs ANTHROPIC_API_KEY");
    const live = createAnthropicProvider({
      kind: "anthropic",
      apiKey: opts.apiKey,
      serverFallbacks: true,
    });
    provider = opts.record ? recordingProvider(live) : live;
  } else {
    provider = recordedProvider();
  }

  const perCase: Record<string, CaseScore[]> = {};
  const routes: RouteSummary[] = [];
  for (const route of opts.routes) {
    const scores: CaseScore[] = [];
    for (const c of opts.cases) {
      if (route === "rules") {
        scores.push(scoreCase(c, null));
        continue;
      }
      const forceLevel = FORCED[route];
      const pages = c.recording.read.pages;
      const result = await assistExtraction(
        {
          documentId: c.key,
          pages,
          analyze: c.recording.analyze,
          ruleFindings: c.ruleFindings,
          link: async (quotes) => evalLink(pages, quotes),
          dateContext: c.dateContext,
          caseKey: c.key,
        },
        policyFor(route, provider),
        { provider, ...(forceLevel ? { forceLevel } : {}) },
      );
      scores.push(
        scoreCase(c, { findings: result.aiFindings, runs: result.runs, needsReview: result.needsReview }),
      );
    }
    perCase[route] = scores;
    routes.push(summarise(route, scores));
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: opts.mode,
    cases: opts.cases.map((c) => c.key),
    routes,
    perCase,
    notes: [
      opts.mode === "recorded"
        ? "Recorded mode: model answers are replayed from evals/recordings (currently hand-written stand-ins, source: synthetic). Token counts and cost are estimated from prompt sizes; latency is the recorded value. Re-record with --mode live --record."
        : "Live mode: real calls; cost from the provider's usage and the price table (prices marked verify).",
      "Quotes are located with the TypeScript linker (exact token match) plus a spacing-insensitive fallback graded `strong` (evals/lib/link.ts), standing in for the engine's fuzzy linker.",
      "Steady state: AI-only located findings are trusted without the first-N review, so confident-wrong is measured at its worst.",
    ],
  };
}
