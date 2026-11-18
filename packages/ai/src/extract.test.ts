import { engine } from "@dueproof/contracts";
import { linkQuotes } from "@dueproof/engine-client";
import { describe, expect, it } from "vitest";
import { type AssistInput, assistExtraction } from "./extract";
import { createFakeProvider, type FakeResponse } from "./providers/fake";
import type { StructuredRequest } from "./providers/types";
import { gradedRuleFindings, loadEngineRecording, testPolicy } from "./testing/fixtures";

const asmt = loadEngineRecording("notice-gst-asmt10");
const pages = asmt.read.pages;

function input(overrides: Partial<AssistInput> = {}): AssistInput {
  return {
    documentId: "doc_1",
    clientId: "client_1",
    pages,
    analyze: { confident: false, docType: "GST notice" },
    ruleFindings: gradedRuleFindings(asmt),
    link: async (quotes) => linkQuotes({ pages: [...pages], quotes }),
    dateContext: {
      anchors: { receipt: "2026-10-24", issue: "2026-10-20" },
      holidays: [],
      workingDays: [1, 2, 3, 4, 5, 6],
    },
    ...overrides,
  };
}

const DUTY_QUOTE =
  "You are hereby directed to explain the discrepancies and pay the tax of Rs. 4,52,300 with interest within 30 days of receipt of this notice.";
/**
 * Part of the same sentence, cut before "of receipt": a reading "30 days from
 * issue" is written in it (no anchor named), and disagrees with the rules'
 * "30 days from receipt".
 */
const CUT_QUOTE = "pay the tax of Rs. 4,52,300 with interest within 30 days";

function finding(over: Record<string, unknown> = {}) {
  return {
    kind: "deadline",
    text: "Explain the discrepancies and pay the tax",
    textEn: null,
    quote: DUTY_QUOTE,
    quoteLang: "en",
    pageHint: 1,
    confidence: 0.9,
    dueRule: { type: "relative", anchor: "receipt", amount: 30, unit: "days", condonable: null },
    amountMinor: 45230000,
    desk: null,
    severity: "high",
    ...over,
  };
}

/** Script by level: each level gets its queue of responses; undefined → the built-in reader. */
function byLevel(map: Partial<Record<string, FakeResponse[]>>) {
  return (req: StructuredRequest) => map[req.level]?.shift();
}

describe("assistExtraction", () => {
  it("calls no model when the rules are confident", async () => {
    const fake = createFakeProvider();
    const r = await assistExtraction(
      input({ analyze: { confident: true, docType: "GST notice" } }),
      testPolicy({}, fake),
    );
    expect(r.status).toBe("skipped");
    expect(r.skipped).toBe("rules_confident");
    expect(fake.calls).toHaveLength(0);
  });

  it("calls no model for an excluded client (enforced on the server)", async () => {
    const fake = createFakeProvider();
    const r = await assistExtraction(
      input(),
      testPolicy({ excludedClientIds: ["client_1"] }, fake),
    );
    expect(r.skipped).toBe("client_excluded");
    expect(fake.calls).toHaveLength(0);
  });

  it("does nothing when AI is off", async () => {
    const fake = createFakeProvider();
    const r = await assistExtraction(input(), testPolicy({ mode: "off" }, fake));
    expect(r.skipped).toBe("ai_off");
    expect(fake.calls).toHaveLength(0);
  });

  it("runs Sonnet once and returns located findings and a run record when it agrees with the rules", async () => {
    const fake = createFakeProvider();
    const r = await assistExtraction(input(), testPolicy({}, fake));
    expect(r.status).toBe("done");
    expect(r.level).toBe("sonnet");
    expect(r.needsReview).toBe(false);
    expect(r.runs).toHaveLength(1);
    const run = r.runs[0];
    expect(run).toMatchObject({
      orgId: "org_test",
      documentId: "doc_1",
      feature: "extract",
      tier: "sonnet",
      provider: "fake",
      model: "claude-sonnet-5-5",
      promptVersion: "extract.sonnet@2026-11-16.1",
      outcome: "ok",
      escalationReason: null,
    });
    expect(run?.costMicroUsd).toBeGreaterThan(0);
    const duty = r.aiFindings.find((f) => f.finding.quote === DUTY_QUOTE);
    expect(duty?.grade).toBe("exact");
    expect(duty?.finding.dueRule).toEqual({
      type: "relative",
      anchor: "receipt",
      amount: 30,
      unit: "days",
    });
    expect(duty?.finding.amountMinor).toBe(45230000);
    // The request carried effort, a schema and no tools.
    const req = fake.calls[0];
    expect(req?.effort).toBe("medium");
    expect(req?.schemaName).toBe("dueproof_extraction");
  });

  it("escalates Sonnet → Opus when Sonnet and the rules disagree on a date", async () => {
    const fake = createFakeProvider({
      script: byLevel({
        sonnet: [
          {
            json: {
              findings: [
                finding({
                  quote: CUT_QUOTE,
                  dueRule: {
                    type: "relative",
                    anchor: "issue",
                    amount: 30,
                    unit: "days",
                    condonable: null,
                  },
                }),
              ],
            },
          },
        ],
        opus: [{ json: { findings: [finding()] } }],
      }),
    });
    const r = await assistExtraction(input(), testPolicy({}, fake));
    expect(r.runs.map((x) => [x.tier, x.escalationReason])).toEqual([
      ["sonnet", null],
      ["opus", "date_conflict"],
    ]);
    expect(r.level).toBe("opus");
    expect(r.needsReview).toBe(false);
    expect(fake.calls[1]?.effort).toBe("high");
  });

  it("drops a reading whose anchor or period the quote does not state, instead of escalating on it", async () => {
    const fake = createFakeProvider({
      script: byLevel({
        sonnet: [
          {
            json: {
              findings: [
                // The quote says "of receipt"; "from issue" is the model's own idea.
                finding({
                  dueRule: {
                    type: "relative",
                    anchor: "issue",
                    amount: 30,
                    unit: "days",
                    condonable: null,
                  },
                }),
                // 90 days appears nowhere in the quote.
                finding({
                  dueRule: {
                    type: "relative",
                    anchor: "receipt",
                    amount: 90,
                    unit: "days",
                    condonable: null,
                  },
                }),
              ],
            },
          },
        ],
      }),
    });
    const r = await assistExtraction(input(), testPolicy({}, fake));
    expect(r.runs).toHaveLength(1);
    expect(r.aiFindings.every((f) => f.finding.dueRule === undefined)).toBe(true);
    expect(r.stats.issues).toMatchObject({
      relative_anchor_not_in_quote: 1,
      relative_period_not_in_quote: 1,
    });
  });

  it("at the Opus cap, keeps Sonnet's reading and sends the item to review instead", async () => {
    const fake = createFakeProvider({
      script: byLevel({
        sonnet: [
          {
            json: {
              findings: [
                finding({
                  quote: CUT_QUOTE,
                  dueRule: {
                    type: "relative",
                    anchor: "issue",
                    amount: 30,
                    unit: "days",
                    condonable: null,
                  },
                }),
              ],
            },
          },
        ],
      }),
    });
    const policy = testPolicy(
      { usage: { aiCallsThisMonth: 3, opusCallsThisMonth: 0, spentMicroUsdThisMonth: 0 } },
      fake,
    );
    const r = await assistExtraction(input(), policy);
    expect(fake.calls).toHaveLength(1);
    expect(r.level).toBe("sonnet");
    expect(r.needsReview).toBe(true);
    expect(r.stoppedBy).toBe("opus_cap");
    expect(r.blockedEscalation).toBe("date_conflict");
    expect(r.aiFindings[0]?.finding.dueRule).toMatchObject({ anchor: "issue" });
  });

  it("steps a Haiku refusal up to Sonnet in our code (Haiku has no server-side fallback)", async () => {
    const fake = createFakeProvider({
      script: byLevel({ haiku: [{ stop: "refusal", refusalCategory: "general_harms" }] }),
    });
    const r = await assistExtraction(input(), testPolicy({ haikuExtraction: true }, fake));
    expect(r.route.level).toBe("haiku");
    expect(r.runs.map((x) => [x.tier, x.outcome, x.escalationReason])).toEqual([
      ["haiku", "refusal", null],
      ["sonnet", "ok", "refusal"],
    ]);
    expect(fake.calls[0]?.effort).toBe("low");
    expect(r.level).toBe("sonnet");
  });

  it("a Sonnet refusal with server-side fallbacks ends in rules-only, flagged for review", async () => {
    const fake = createFakeProvider({ serverFallbacks: true, script: () => ({ stop: "refusal" }) });
    const r = await assistExtraction(input(), testPolicy({}, fake));
    expect(fake.calls).toHaveLength(1);
    expect(r.status).toBe("no_result");
    expect(r.aiFindings).toEqual([]);
    expect(r.needsReview).toBe(true);
    expect(r.stoppedBy).toBe("refusal");
  });

  it("escalates to Opus when the proof gate fails twice", async () => {
    const paraphrase = {
      json: {
        findings: [
          finding({ quote: "The taxpayer has to pay within a month of getting the notice" }),
        ],
      },
    };
    const fake = createFakeProvider({
      script: byLevel({
        sonnet: [paraphrase, structuredClone(paraphrase)],
        opus: [{ json: { findings: [finding()] } }],
      }),
    });
    const r = await assistExtraction(input(), testPolicy({}, fake));
    expect(r.runs.map((x) => [x.tier, x.escalationReason])).toEqual([
      ["sonnet", null],
      ["sonnet", "proof_gate_failed"],
      ["opus", "proof_gate_failed_twice"],
    ]);
    expect(r.level).toBe("opus");
    expect(r.aiFindings[0]?.grade).toBe("exact");
  });

  it("treats invalid JSON as schema_invalid and steps up", async () => {
    const fake = createFakeProvider({
      script: byLevel({ haiku: [{ text: "Sure! Here are the findings: ..." }] }),
    });
    const r = await assistExtraction(input(), testPolicy({ haikuExtraction: true }, fake));
    expect(r.runs.map((x) => [x.tier, x.outcome])).toEqual([
      ["haiku", "schema_invalid"],
      ["sonnet", "ok"],
    ]);
  });

  it("retries once with more room on max_tokens", async () => {
    const fake = createFakeProvider({ script: byLevel({ sonnet: [{ stop: "max_tokens" }] }) });
    const r = await assistExtraction(input(), testPolicy({}, fake));
    expect(r.runs.map((x) => [x.tier, x.outcome, x.escalationReason])).toEqual([
      ["sonnet", "max_tokens", null],
      ["sonnet", "ok", "max_tokens"],
    ]);
    expect(fake.calls[1]?.maxOutputTokens).toBe(2 * (fake.calls[0]?.maxOutputTokens ?? 0));
  });

  it("stops before calling when the monthly budget would be exceeded", async () => {
    const fake = createFakeProvider();
    const r = await assistExtraction(
      input(),
      testPolicy(
        {
          monthlyBudgetMicroUsd: 100_000,
          usage: { aiCallsThisMonth: 10, opusCallsThisMonth: 0, spentMicroUsdThisMonth: 99_999 },
        },
        fake,
      ),
    );
    expect(fake.calls).toHaveLength(0);
    expect(r.stoppedBy).toBe("budget_exceeded");
    expect(r.needsReview).toBe(true);
  });

  it("records a provider error without its message and carries on with rules only", async () => {
    const fake = createFakeProvider({
      fail: () => Object.assign(new Error("echo of the request text"), { status: 500 }),
    });
    const r = await assistExtraction(input(), testPolicy({}, fake));
    expect(r.runs).toHaveLength(1);
    expect(r.runs[0]?.outcome).toBe("provider_error");
    expect(JSON.stringify(r.runs)).not.toContain("echo");
    expect(r.aiFindings).toEqual([]);
    expect(r.needsReview).toBe(true);
  });

  it("redacts PAN before sending and restores it so the quote is still found on the page", async () => {
    const text =
      "The assessee with PAN AAACH1234K must file the return within 30 days of receipt of this notice.";
    const page: engine.PageText = engine.PageText.parse({
      page: 1,
      width: 595,
      height: 842,
      text,
      words: text
        .split(" ")
        .map((w, i) => ({ text: w, rect: [i * 10, 0, i * 10 + 9, 10], line: 0 })),
      engine: "text_layer",
      confidence: 1,
      languages: ["en"],
    });
    const fake = createFakeProvider();
    const r = await assistExtraction(
      input({
        pages: [page],
        ruleFindings: [],
        link: async (quotes) => linkQuotes({ pages: [page], quotes }),
      }),
      testPolicy({ redactPii: true }, fake),
    );
    expect(fake.calls[0]?.user).not.toContain("AAACH1234K");
    expect(fake.calls[0]?.user).toContain("⟦PAN_1⟧");
    expect(r.aiFindings[0]?.finding.quote).toContain("AAACH1234K");
    expect(r.aiFindings[0]?.grade).toBe("exact");
  });

  it("records `local` as the tier in local mode", async () => {
    const fake = createFakeProvider();
    const r = await assistExtraction(
      input(),
      testPolicy(
        { mode: "local", models: { haiku: "qwen3", sonnet: "qwen3", opus: "qwen3" } },
        fake,
      ),
    );
    expect(r.runs[0]).toMatchObject({ tier: "local", model: "qwen3", costMicroUsd: 0 });
  });
});
