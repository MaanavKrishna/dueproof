import { describe, expect, it } from "vitest";
import { opusAllowed } from "./policy";
import { createFakeProvider } from "./providers/fake";
import {
  type AttemptFacts,
  decideRoute,
  judgeAttempt,
  levelForFeature,
  nextLevel,
  type RouteSignals,
} from "./routing";
import { testPolicy } from "./testing/fixtures";

const digital = { engine: "text_layer" as const, confidence: 1, languages: ["en"] };
const scan = { engine: "paddleocr" as const, confidence: 0.6, languages: ["en"] };
const malayalam = { engine: "text_layer" as const, confidence: 1, languages: ["ml", "en"] };

const on = testPolicy({}, createFakeProvider());

describe("decideRoute: given these signals, this route", () => {
  const table: [
    string,
    RouteSignals,
    Partial<typeof on>,
    ReturnType<typeof decideRoute>["level"],
    string[],
  ][] = [
    [
      "rules confident → no model",
      { rulesConfident: true, pages: [scan], docType: "x" },
      {},
      null,
      ["rules_confident"],
    ],
    [
      "AI off → no model",
      { rulesConfident: false, pages: [scan] },
      { mode: "off" },
      null,
      ["ai_off"],
    ],
    [
      "no provider → no model",
      { rulesConfident: false, pages: [scan] },
      { provider: null },
      null,
      ["ai_off"],
    ],
    [
      "clean digital, Haiku not yet passed its eval → Sonnet",
      { rulesConfident: false, pages: [digital], docType: "GST notice" },
      {},
      "sonnet",
      ["clean_digital_haiku_not_enabled"],
    ],
    [
      "clean digital, Haiku enabled → Haiku",
      { rulesConfident: false, pages: [digital], docType: "GST notice" },
      { haikuExtraction: true },
      "haiku",
      ["clean_digital"],
    ],
    [
      "scan → Sonnet even with Haiku enabled",
      { rulesConfident: false, pages: [digital, scan], docType: "Notice" },
      { haikuExtraction: true },
      "sonnet",
      ["scan_or_photo"],
    ],
    [
      "text layer below the OCR bar counts as a scan",
      { rulesConfident: false, pages: [{ ...digital, confidence: 0.5 }], docType: "Notice" },
      { haikuExtraction: true },
      "sonnet",
      ["scan_or_photo"],
    ],
    [
      "regional language → Sonnet",
      { rulesConfident: false, pages: [malayalam], docType: "Circular" },
      { haikuExtraction: true },
      "sonnet",
      ["regional_language"],
    ],
    [
      "unknown notice type → Sonnet",
      { rulesConfident: false, pages: [digital] },
      { haikuExtraction: true },
      "sonnet",
      ["unusual_notice"],
    ],
  ];
  for (const [name, signals, overrides, level, reasons] of table) {
    it(name, () => {
      const d = decideRoute(signals, { ...on, ...overrides });
      expect(d.level).toBe(level);
      expect(d.reasons).toEqual(reasons);
    });
  }

  it("flags long orders (more than N pages) for Opus after Sonnet, never straight to Opus", () => {
    const pages = Array.from({ length: 11 }, () => digital);
    const d = decideRoute({ rulesConfident: false, pages, docRole: "order", docType: "Order" }, on);
    expect(d.level).toBe("sonnet");
    expect(d.longOrder).toBe(true);
    const short = decideRoute(
      { rulesConfident: false, pages: pages.slice(0, 10), docRole: "order", docType: "Order" },
      on,
    );
    expect(short.longOrder).toBe(false);
  });

  it("uses fixed levels for the other features", () => {
    expect(levelForFeature("summary")).toBe("haiku");
    expect(levelForFeature("triage")).toBe("haiku");
    expect(levelForFeature("answer")).toBe("sonnet");
    expect(levelForFeature("draft_reply")).toBe("sonnet");
  });

  it("steps one level at a time", () => {
    expect(nextLevel("haiku")).toBe("sonnet");
    expect(nextLevel("sonnet")).toBe("opus");
    expect(nextLevel("opus")).toBeNull();
  });
});

describe("judgeAttempt: the escalation table", () => {
  const base: AttemptFacts = {
    level: "sonnet",
    outcome: "ok",
    retriedHere: false,
    gateFailures: 0,
    gateFailed: false,
    dateConflict: false,
    amountConflict: false,
    longOrder: false,
    serverFallbacks: true,
  };
  const cases: [string, Partial<AttemptFacts>, ReturnType<typeof judgeAttempt>][] = [
    ["clean result → accept", {}, { action: "accept" }],
    [
      "Haiku refusal → Sonnet (no server fallback on Haiku)",
      { level: "haiku", outcome: "refusal" },
      { action: "escalate", to: "sonnet", reason: "refusal" },
    ],
    [
      "Sonnet refusal with server fallback → stop",
      { outcome: "refusal" },
      { action: "stop", reason: "refusal" },
    ],
    [
      "Sonnet refusal without server fallback → Opus",
      { outcome: "refusal", serverFallbacks: false },
      { action: "escalate", to: "opus", reason: "refusal" },
    ],
    [
      "max_tokens first time → retry same level",
      { outcome: "max_tokens" },
      { action: "retry", reason: "max_tokens" },
    ],
    [
      "max_tokens again → step up",
      { outcome: "max_tokens", retriedHere: true },
      { action: "escalate", to: "opus", reason: "max_tokens" },
    ],
    [
      "schema invalid on Haiku → Sonnet",
      { level: "haiku", outcome: "schema_invalid" },
      { action: "escalate", to: "sonnet", reason: "schema_invalid" },
    ],
    [
      "provider error → stop",
      { outcome: "provider_error" },
      { action: "stop", reason: "provider_error" },
    ],
    [
      "gate fails on Haiku → Sonnet",
      { level: "haiku", gateFailed: true, gateFailures: 1 },
      { action: "escalate", to: "sonnet", reason: "proof_gate_failed" },
    ],
    [
      "gate fails once on Sonnet → retry Sonnet",
      { gateFailed: true, gateFailures: 1 },
      { action: "retry", reason: "proof_gate_failed" },
    ],
    [
      "gate fails twice → Opus",
      { gateFailed: true, gateFailures: 2 },
      { action: "escalate", to: "opus", reason: "proof_gate_failed_twice" },
    ],
    [
      "date conflict on Sonnet → Opus",
      { dateConflict: true },
      { action: "escalate", to: "opus", reason: "date_conflict" },
    ],
    [
      "amount conflict on Haiku → Sonnet (one step only)",
      { level: "haiku", amountConflict: true },
      { action: "escalate", to: "sonnet", reason: "amount_conflict" },
    ],
    [
      "long order after Sonnet → Opus",
      { longOrder: true },
      { action: "escalate", to: "opus", reason: "long_order" },
    ],
    ["long order on Opus → accept", { level: "opus", longOrder: true }, { action: "accept" }],
    [
      "conflict on Opus → stop (review with both readings)",
      { level: "opus", dateConflict: true },
      { action: "stop", reason: "date_conflict" },
    ],
  ];
  for (const [name, facts, verdict] of cases) {
    it(name, () => expect(judgeAttempt({ ...base, ...facts })).toEqual(verdict));
  }
});

describe("Opus cap", () => {
  it("allows Opus only while it stays within the cap share of this month's calls", () => {
    const p = testPolicy({ opusCapPercent: 5 });
    expect(opusAllowed(p, 0, 0)).toBe(false); // first call of the month can't be Opus
    expect(opusAllowed(p, 19, 0)).toBe(true); // 1 of 20 = 5 %
    expect(opusAllowed(p, 19, 1)).toBe(false);
    expect(opusAllowed(p, 39, 1)).toBe(true); // 2 of 40
    expect(opusAllowed(testPolicy({ opusCapPercent: 0 }), 1000, 0)).toBe(false);
    expect(opusAllowed(testPolicy({ opusCapPercent: 100 }), 0, 0)).toBe(true);
  });
});
