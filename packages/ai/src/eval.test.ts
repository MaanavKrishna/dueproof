/**
 * The eval harness (evals/) in recorded mode, and its gate.
 */
import { describe, expect, it } from "vitest";
import { loadCases } from "../../../evals/lib/cases";
import { gate, scoreCase, summarise } from "../../../evals/lib/metrics";
import { renderMarkdown } from "../../../evals/lib/report";
import { ROUTES, runEval } from "../../../evals/lib/runner";

const cases = loadCases();

describe("eval (recorded mode)", () => {
  it("loads every labelled fixture with its recorded engine responses", () => {
    expect(cases.map((c) => c.key).sort()).toEqual([
      "Scan-circular-photo",
      "circular-NMR-SAF-2026-041",
      "invoice-HVC-2026-1183",
      "minutes-board-87",
      "notice-gst-asmt10",
    ]);
    const asmt = cases.find((c) => c.key === "notice-gst-asmt10");
    expect(asmt?.dateContext.anchors).toEqual({ receipt: "2026-10-24", issue: "2026-10-20" });
    expect(asmt?.amounts).toEqual([{ quote: "pay the tax of Rs. 4,52,300", minor: 45230000 }]);
  });

  it("runs every route and reports the metrics per route", async () => {
    const report = await runEval({ mode: "recorded", routes: ROUTES, cases });
    expect(report.routes.map((r) => r.route)).toEqual([...ROUTES]);
    const by = Object.fromEntries(report.routes.map((r) => [r.route, r]));
    // Rules alone: no calls, no cost.
    expect(by.rules?.aiCalls).toBe(0);
    expect(by.rules?.costMicroUsd).toBe(0);
    // The shipped router skips the model where the rules are confident (ASMT-10).
    const routedAsmt = report.perCase.routed?.find((s) => s.key === "notice-gst-asmt10");
    expect(routedAsmt?.calls).toBe(0);
    // Assisted routes find more than rules alone on these notices.
    expect(by.sonnet?.recall ?? 0).toBeGreaterThan(by.rules?.recall ?? 1);
    // Every route passes the gate on the recorded set.
    for (const r of report.routes) expect(r.passes).toBe(true);
    // Haiku's anchor misreading on ASMT-10 is a conflict, so it goes to review instead of being trusted.
    const haikuAsmt = report.perCase.haiku?.find((s) => s.key === "notice-gst-asmt10");
    expect(haikuAsmt?.confidentWrong).toEqual([]);
    expect(renderMarkdown(report)).toContain("| routed |");
  });
});

describe("eval gate", () => {
  const circular = cases.find((c) => c.key === "circular-NMR-SAF-2026-041");
  if (!circular) throw new Error("fixture missing");
  const page3 = circular.recording.read.pages[2]?.text ?? "";
  const quote = page3.slice(
    page3.indexOf("മുഴുവൻ"),
    page3.indexOf("സമർപ്പിക്കണം.") + "സമർപ്പിക്കണം.".length,
  );

  it("counts a located AI finding with the wrong date as confident-wrong, and the route fails", () => {
    const wrong = scoreCase(circular, {
      findings: [
        {
          id: "ai-x",
          grade: "strong",
          page: 3,
          finding: {
            kind: "deadline",
            text: "Submit the audit report",
            quote,
            quoteLang: "ml",
            confidence: 0.9,
            dueRule: { type: "fixed", date: "2026-09-15" },
          },
        },
      ],
      runs: [],
      needsReview: false,
    });
    expect(wrong.confidentWrong).toEqual([
      expect.objectContaining({
        why: "wrong_date",
        computed: "2026-09-15",
        expected: "2026-09-05",
      }),
    ]);
    expect(summarise("bad", [wrong]).passes).toBe(false);
    expect(gate({ confidentWrong: 0 })).toBe(true);
  });

  it("does not count an unlocated AI date (an unverified suggestion) as confident-wrong", () => {
    const s = scoreCase(circular, {
      findings: [
        {
          id: "ai-x",
          grade: "unlocated",
          finding: {
            kind: "deadline",
            text: "x",
            quote: "made-up text",
            quoteLang: "en",
            confidence: 0.9,
            dueRule: { type: "fixed", date: "2026-09-15" },
          },
        },
      ],
      runs: [],
      needsReview: false,
    });
    expect(s.confidentWrong).toEqual([]);
  });
});
