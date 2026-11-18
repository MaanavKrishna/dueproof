import type { DateRule, engine, Verification } from "@dueproof/contracts";
import { describe, expect, it } from "vitest";
import {
  type GradedFinding,
  quoteSimilarity,
  reconcile,
  ruleDerivableFromQuote,
} from "./reconcile";

type EngineFinding = engine.EngineFinding;

const REPLY_QUOTE =
  "You are hereby directed to explain the discrepancies and pay the tax of Rs. 4,52,300 with interest within 30 days of receipt of this notice.";
const HEARING_QUOTE =
  "A personal hearing is fixed on 18 November 2026 at 11:00 AM before the undersigned at the Division office.";

function f(
  id: string,
  partial: Partial<EngineFinding> & Pick<EngineFinding, "kind" | "quote">,
  grade: Verification = "exact",
  page = 1,
): GradedFinding {
  return {
    id,
    grade,
    page,
    finding: { text: partial.quote, quoteLang: "en", confidence: 0.8, ...partial },
  };
}

const reply30 = { type: "relative", anchor: "receipt", amount: 30, unit: "days" } as const;
const hearing = { type: "fixed", date: "2026-11-18" } as const;

describe("reconcile", () => {
  it("both agree and located → rule+ai, verified, auto deadline", () => {
    const { findings } = reconcile(
      [f("r1", { kind: "obligation", quote: REPLY_QUOTE, dueRule: reply30, confidence: 0.7 })],
      [
        f(
          "a1",
          {
            kind: "deadline",
            quote: REPLY_QUOTE.slice(0, 90),
            dueRule: reply30,
            confidence: 0.9,
            textEn: "Reply in 30 days",
          },
          "strong",
        ),
      ],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "r1",
      origin: "rule+ai",
      status: "verified",
      needsReview: false,
      deadline: "auto",
      grade: "exact",
      confidence: 0.9,
      textEn: "Reply in 30 days",
      quote: REPLY_QUOTE,
      reasons: ["agreed"],
      conflicts: [],
    });
    expect(findings[0]?.aiSource?.id).toBe("a1");
  });

  it("rule only → origin rule", () => {
    const { findings } = reconcile(
      [f("r1", { kind: "hearing", quote: HEARING_QUOTE, dueRule: hearing })],
      [],
    );
    expect(findings[0]).toMatchObject({
      origin: "rule",
      status: "verified",
      deadline: "auto",
      reasons: ["rule_only"],
    });
  });

  it("rule only but unlocated → needs review before it can be a deadline", () => {
    const { findings } = reconcile(
      [f("r1", { kind: "hearing", quote: HEARING_QUOTE, dueRule: hearing }, "unlocated")],
      [],
    );
    expect(findings[0]).toMatchObject({
      origin: "rule",
      status: "needs_review",
      deadline: "after_review",
    });
  });

  it("AI only & located → ai, first N need review, then auto", () => {
    const ai = [1, 2, 3].map((i) =>
      f(`a${i}`, {
        kind: "deadline",
        quote: `Submit the stock register number ${i} by 30 November 2026.`,
        dueRule: { type: "fixed", date: "2026-11-30" },
      }),
    );
    const { findings, aiFirstNUsed } = reconcile([], ai, { reviewFirstN: 5, aiReviewedSoFar: 3 });
    expect(findings.map((x) => [x.origin, x.needsReview, x.deadline])).toEqual([
      ["ai", true, "after_review"],
      ["ai", true, "after_review"],
      ["ai", false, "auto"],
    ]);
    expect(findings[0]?.reasons).toEqual(["ai_only", "ai_first_n"]);
    expect(aiFirstNUsed).toBe(2);
  });

  it("AI only: an approximate, strong, underived or statutory date is always reviewed (C3)", () => {
    const quote = "You are directed to appear on 20.10.2026 at 11 AM";
    const cases: [Verification, DateRule, string[]][] = [
      // The review's probe: wrong month and year, approximate grade, org past first N.
      [
        "approximate",
        { type: "fixed", date: "2027-12-20" },
        ["ai_only", "ai_inexact", "ai_underived"],
      ],
      ["approximate", { type: "fixed", date: "2026-10-20" }, ["ai_only", "ai_inexact"]],
      ["strong", { type: "fixed", date: "2026-10-20" }, ["ai_only", "ai_inexact"]],
      ["exact", { type: "fixed", date: "2027-12-20" }, ["ai_only", "ai_underived"]],
      [
        "exact",
        { type: "relative", anchor: "receipt", amount: 30, unit: "days" },
        ["ai_only", "ai_underived"],
      ],
      [
        "exact",
        { type: "statutory", ruleKey: "in.gst.gstr3b.monthly", period: "2026-10" },
        ["ai_only", "ai_statutory"],
      ],
    ];
    for (const [grade, dueRule, reasons] of cases) {
      const { findings, aiFirstNUsed } = reconcile(
        [],
        [f("a1", { kind: "deadline", quote, dueRule }, grade)],
        { aiReviewedSoFar: 1_000_000 },
      );
      expect(findings[0], JSON.stringify(dueRule)).toMatchObject({
        origin: "ai",
        status: "needs_review",
        needsReview: true,
        deadline: "after_review",
        reasons,
      });
      // Weak findings do not count towards the organisation's first N.
      expect(aiFirstNUsed).toBe(0);
    }
    // The same finding, exact and copied from its quote, may be auto once past first N.
    const good = reconcile(
      [],
      [f("a1", { kind: "deadline", quote, dueRule: { type: "fixed", date: "2026-10-20" } })],
      { aiReviewedSoFar: 25 },
    );
    expect(good.findings[0]).toMatchObject({ deadline: "auto", reasons: ["ai_only"] });
  });

  it("only an exact, derivable, non-statutory AI date past first N is ever auto (property)", () => {
    let seed = 3;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
    const quotes = [
      REPLY_QUOTE,
      HEARING_QUOTE,
      "Submit the register by 30 November 2026.",
      "file your return for the month",
    ];
    const rules: (DateRule | undefined)[] = [
      undefined,
      reply30,
      hearing,
      { type: "fixed", date: "2026-11-30" },
      { type: "fixed", date: "2026-11-23" },
      { ...reply30, anchor: "issue" },
      { ...reply30, amount: 90 },
      { ...reply30, amount: 1e9 },
      { type: "statutory", ruleKey: "in.gst.gstr3b.monthly", period: "2031-01" },
    ];
    const grades: Verification[] = ["exact", "strong", "approximate", "unlocated"];
    const ctx = {
      anchors: { receipt: "2026-11-01", issue: "2026-10-20" },
      holidays: [],
      workingDays: pick([[1, 2, 3, 4, 5, 6], [8], []]),
    };
    const autos = { ai: 0, rule: 0 };
    for (let i = 0; i < 300; i++) {
      const mk = (id: string, kind: "obligation" | "deadline" | "hearing") => {
        const dueRule = pick(rules);
        return f(
          id,
          { kind, quote: pick(quotes), ...(dueRule ? { dueRule } : {}) },
          pick(grades),
          1 + Math.floor(rand() * 3),
        );
      };
      const ruleSide = Array.from({ length: Math.floor(rand() * 3) }, (_, k) =>
        mk(`r${k}`, pick(["obligation", "deadline", "hearing"] as const)),
      );
      const aiSide = Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, k) =>
        mk(`a${k}`, pick(["obligation", "deadline", "hearing"] as const)),
      );
      const aiReviewedSoFar = pick([0, 24, 25, 1_000]);
      const opts = { aiReviewedSoFar, ...(rand() < 0.5 ? { dateContext: ctx } : {}) };
      const { findings } = reconcile(ruleSide, aiSide, opts);
      for (const x of findings) {
        if (x.deadline !== "auto") continue;
        const rule = x.dueRule as DateRule;
        // Never a deadline on an unlocated grade.
        expect(x.grade).not.toBe("unlocated");
        if (x.dateEvidence === "ai") {
          const src = x.aiSource as GradedFinding;
          expect(src.grade).toBe("exact");
          expect(rule.type).not.toBe("statutory");
          expect(ruleDerivableFromQuote(rule, src.finding.quote)).toBe(true);
        } else {
          // Proved by the rule's own quote, never borrowed.
          expect(x.dateEvidence).toBe("rule");
          expect(x.ruleSource?.grade).not.toBe("unlocated");
          expect(x.ruleSource?.finding.dueRule).toEqual(rule);
        }
        // At 24, the run's first eligible AI finding uses the last first-N slot.
        if (x.origin === "ai") expect(aiReviewedSoFar).toBeGreaterThanOrEqual(24);
        if (x.origin === "rule+ai" && x.aiSource?.finding.dueRule)
          expect(x.aiSource.finding.dueRule).toEqual(x.ruleSource?.finding.dueRule);
        autos[x.dateEvidence === "ai" ? "ai" : "rule"]++;
      }
    }
    // The generator does reach both kinds of auto deadline.
    expect(autos.ai).toBeGreaterThan(0);
    expect(autos.rule).toBeGreaterThan(0);
  });

  it("never throws on malformed input", () => {
    const junk = [
      { id: "x", grade: "exact", finding: { kind: "deadline", quote: undefined } },
      { id: "y", grade: "exact", finding: { kind: "deadline", quote: 7, dueRule: { type: "x" } } },
      {
        id: "z",
        grade: "exact",
        finding: {
          kind: "deadline",
          quote: "within 100000000 days",
          dueRule: { type: "relative", anchor: "receipt", amount: 1e8, unit: "days" },
        },
      },
    ] as unknown as GradedFinding[];
    const ctx = { anchors: { receipt: "2026-11-01" }, holidays: [], workingDays: [8] };
    expect(() => reconcile(junk, junk, { dateContext: ctx })).not.toThrow();
    expect(() => reconcile([], junk, { dateContext: ctx })).not.toThrow();
    const { findings } = reconcile([], junk, { dateContext: ctx, aiReviewedSoFar: 99 });
    expect(findings.every((x) => x.deadline !== "auto")).toBe(true);
  });

  it("AI only & unlocated → unverified suggestion, never a deadline", () => {
    const { findings, aiFirstNUsed } = reconcile(
      [],
      [
        f(
          "a1",
          {
            kind: "deadline",
            quote: "Pay by 30 November 2026",
            dueRule: { type: "fixed", date: "2026-11-30" },
          },
          "unlocated",
        ),
      ],
      { reviewFirstN: 0 },
    );
    expect(findings[0]).toMatchObject({
      origin: "ai",
      status: "unverified",
      deadline: "never",
      reasons: ["ai_only", "unlocated"],
    });
    expect(aiFirstNUsed).toBe(0);
  });

  it("conflicting dates → needs review with both", () => {
    const { findings } = reconcile(
      [f("r1", { kind: "obligation", quote: REPLY_QUOTE, dueRule: reply30 })],
      [f("a1", { kind: "deadline", quote: REPLY_QUOTE, dueRule: { ...reply30, amount: 15 } })],
    );
    expect(findings[0]).toMatchObject({
      origin: "rule+ai",
      status: "needs_review",
      needsReview: true,
      deadline: "after_review",
      reasons: ["agreed", "conflict_due"],
      dueRule: reply30,
    });
    expect(findings[0]?.conflicts).toEqual([
      { field: "due", rule: reply30, ai: { ...reply30, amount: 15 } },
    ]);
  });

  it("with a date context, conflicts carry both dates; equal dates today are still a conflict (M10)", () => {
    const ctx = {
      anchors: { receipt: "2026-10-24" },
      holidays: [],
      workingDays: [1, 2, 3, 4, 5, 6],
    };
    const conflict = reconcile(
      [f("r1", { kind: "obligation", quote: REPLY_QUOTE, dueRule: reply30 })],
      [f("a1", { kind: "deadline", quote: REPLY_QUOTE, dueRule: { ...reply30, amount: 15 } })],
      { dateContext: ctx },
    );
    expect(conflict.findings[0]?.conflicts[0]).toMatchObject({
      ruleDueOn: "2026-11-23",
      aiDueOn: "2026-11-08",
    });
    const same = reconcile(
      [f("r1", { kind: "obligation", quote: REPLY_QUOTE, dueRule: reply30 })],
      [
        f("a1", {
          kind: "deadline",
          quote: REPLY_QUOTE,
          dueRule: { type: "fixed", date: "2026-11-23" },
        }),
      ],
      { dateContext: ctx },
    );
    // A fixed date and "30 days from receipt" agree only while the received
    // date stays 24 Oct; correcting it would move one and not the other.
    expect(same.findings[0]).toMatchObject({
      status: "needs_review",
      deadline: "after_review",
      reasons: ["agreed", "conflict_due"],
    });
    expect(same.findings[0]?.conflicts[0]).toMatchObject({
      ruleDueOn: "2026-11-23",
      aiDueOn: "2026-11-23",
    });
  });

  it("from receipt and from issue disagree, even when both anchors are the same day (M10)", () => {
    const ctx = {
      anchors: { receipt: "2026-11-01", issue: "2026-11-01" },
      holidays: [],
      workingDays: [1, 2, 3, 4, 5, 6],
    };
    const { findings } = reconcile(
      [f("r1", { kind: "obligation", quote: REPLY_QUOTE, dueRule: reply30 })],
      [f("a1", { kind: "deadline", quote: REPLY_QUOTE, dueRule: { ...reply30, anchor: "issue" } })],
      { dateContext: ctx, aiReviewedSoFar: 99 },
    );
    expect(findings[0]).toMatchObject({
      status: "needs_review",
      deadline: "after_review",
      reasons: ["agreed", "conflict_due"],
      dueRule: reply30,
    });
    expect(findings[0]?.conflicts[0]).toMatchObject({
      field: "due",
      ruleDueOn: "2026-12-01",
      aiDueOn: "2026-12-01",
    });
    // Without a date context too.
    const bare = reconcile(
      [f("r1", { kind: "obligation", quote: REPLY_QUOTE, dueRule: reply30 })],
      [f("a1", { kind: "deadline", quote: REPLY_QUOTE, dueRule: { ...reply30, anchor: "issue" } })],
    );
    expect(bare.findings[0]?.reasons).toContain("conflict_due");
    // A condonable period on one side only is a different rule too.
    const condone = reconcile(
      [f("r1", { kind: "obligation", quote: REPLY_QUOTE, dueRule: reply30 })],
      [
        f("a1", {
          kind: "deadline",
          quote: REPLY_QUOTE,
          dueRule: { ...reply30, condonable: { amount: 30, unit: "days" } },
        }),
      ],
      { dateContext: ctx },
    );
    expect(condone.findings[0]?.reasons).toContain("conflict_due");
  });

  it("a conflict whose AI side cannot be resolved still carries the rule's date, and does not throw", () => {
    const ctx = { anchors: { receipt: "2026-11-01" }, holidays: [], workingDays: [1, 2, 3, 4, 5] };
    const { findings } = reconcile(
      [f("r1", { kind: "obligation", quote: REPLY_QUOTE, dueRule: reply30 })],
      [f("a1", { kind: "deadline", quote: REPLY_QUOTE, dueRule: { ...reply30, amount: 1e8 } })],
      { dateContext: ctx },
    );
    expect(findings[0]?.conflicts[0]).toEqual({
      field: "due",
      rule: reply30,
      ai: { ...reply30, amount: 1e8 },
      ruleDueOn: "2026-12-01",
    });
    expect(findings[0]?.deadline).toBe("after_review");
  });

  it("conflicting amounts → needs review", () => {
    const { findings } = reconcile(
      [
        f("r1", {
          kind: "amount",
          quote: "tax of Rs. 4,52,300",
          text: "Rs. 4,52,300",
          amountMinor: 45_230_000,
        }),
      ],
      [
        f("a1", {
          kind: "amount",
          quote: "tax of Rs. 4,52,300",
          text: "₹4,52,300",
          amountMinor: 4_523_000,
        }),
      ],
    );
    expect(findings[0]).toMatchObject({
      status: "needs_review",
      reasons: ["agreed", "conflict_amount"],
      amountMinor: 45_230_000,
    });
    expect(findings[0]?.conflicts).toEqual([{ field: "amount", rule: 45_230_000, ai: 4_523_000 }]);
  });

  it("a merged pair takes the AI date only when the rule had none, and never without review (C4a)", () => {
    // Even an exact, derivable AI date, in an organisation long past first N:
    // the rules read the same words and found no date, so a person looks.
    const { findings, aiFirstNUsed } = reconcile(
      [f("r1", { kind: "obligation", quote: REPLY_QUOTE })],
      [f("a1", { kind: "deadline", quote: REPLY_QUOTE, dueRule: reply30 })],
      { aiReviewedSoFar: 1_000 },
    );
    expect(findings[0]).toMatchObject({
      origin: "rule+ai",
      dueRule: reply30,
      status: "needs_review",
      needsReview: true,
      deadline: "after_review",
      reasons: ["ai_date"],
      dateEvidence: "ai",
    });
    expect(findings[0]?.reasons).not.toContain("agreed");
    expect(aiFirstNUsed).toBe(0);
    // The review's probe: an organisation with no AI history, an AI date the
    // quote does not even state.
    const probe = reconcile(
      [
        f("q0", {
          kind: "obligation",
          quote: "you are required to appear before the undersigned on the date fixed",
        }),
      ],
      [
        f("ai-0", {
          kind: "deadline",
          quote: "you are required to appear before the undersigned on the date fixed",
          dueRule: { type: "fixed", date: "2027-01-05" },
        }),
      ],
      { aiReviewedSoFar: 0 },
    );
    expect(probe.findings[0]).toMatchObject({
      deadline: "after_review",
      reasons: ["ai_date", "ai_underived"],
    });
  });

  it("an unlocated rule date is not rescued by a located, dateless AI quote (C4b)", () => {
    const { findings } = reconcile(
      [
        f(
          "q0",
          {
            kind: "deadline",
            quote: "furnish reply within 30 days of receipt of this notice",
            dueRule: reply30,
          },
          "unlocated",
          2,
        ),
      ],
      [
        f(
          "ai-0",
          {
            kind: "obligation",
            quote: "furnish reply within 30 days of receipt of this notice failing which",
          },
          "strong",
          1,
        ),
      ],
      { aiReviewedSoFar: 99 },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      origin: "rule+ai",
      grade: "unlocated",
      status: "needs_review",
      deadline: "after_review",
      reasons: ["rule_date", "unlocated"],
      dateEvidence: "rule",
    });
    // No page from the other side's evidence: nothing to draw a box on.
    expect(findings[0]?.page).toBeUndefined();
    // A located rule date with a dateless AI quote is still a deadline, on the rule's evidence.
    const ok = reconcile(
      [f("r1", { kind: "deadline", quote: REPLY_QUOTE, dueRule: reply30 }, "approximate", 3)],
      [f("a1", { kind: "obligation", quote: REPLY_QUOTE }, "exact", 4)],
    );
    expect(ok.findings[0]).toMatchObject({
      grade: "approximate",
      page: 3,
      deadline: "auto",
      reasons: ["rule_date"],
      dateEvidence: "rule",
    });
  });

  it("an agreed date is proved by the rule's quote, or by a trustworthy AI quote", () => {
    // Rule unlocated, AI exact and the date written in its quote: the AI's quote proves it.
    const rescued = reconcile(
      [f("r1", { kind: "obligation", quote: REPLY_QUOTE, dueRule: reply30 }, "unlocated")],
      [f("a1", { kind: "deadline", quote: REPLY_QUOTE, dueRule: reply30 }, "exact", 2)],
    );
    expect(rescued.findings[0]).toMatchObject({
      grade: "exact",
      page: 2,
      deadline: "auto",
      dateEvidence: "ai",
      reasons: ["agreed"],
    });
    // Rule unlocated, AI only approximate: not proved.
    const weak = reconcile(
      [f("r1", { kind: "obligation", quote: REPLY_QUOTE, dueRule: reply30 }, "unlocated")],
      [f("a1", { kind: "deadline", quote: REPLY_QUOTE, dueRule: reply30 }, "approximate", 2)],
    );
    expect(weak.findings[0]).toMatchObject({
      grade: "unlocated",
      deadline: "after_review",
      dateEvidence: "rule",
    });
    expect(weak.findings[0]?.page).toBeUndefined();
  });

  it("both unlocated → needs review", () => {
    const { findings } = reconcile(
      [f("r1", { kind: "hearing", quote: HEARING_QUOTE, dueRule: hearing }, "unlocated")],
      [f("a1", { kind: "hearing", quote: HEARING_QUOTE, dueRule: hearing }, "unlocated")],
    );
    expect(findings[0]).toMatchObject({
      origin: "rule+ai",
      status: "needs_review",
      deadline: "after_review",
      grade: "unlocated",
    });
  });

  it("pairs each finding once, best match first, and keeps input order", () => {
    const rules = [
      f("r1", { kind: "hearing", quote: HEARING_QUOTE, dueRule: hearing }),
      f("r2", { kind: "obligation", quote: REPLY_QUOTE, dueRule: reply30 }),
    ];
    const ai = [
      f("a1", { kind: "deadline", quote: REPLY_QUOTE, dueRule: reply30 }),
      f("a2", { kind: "deadline", quote: REPLY_QUOTE.slice(0, 60), dueRule: reply30 }),
      f("a3", { kind: "reference", quote: "Ref: ASMT-10/2026/118", text: "ASMT-10/2026/118" }),
    ];
    const a = reconcile(rules, ai, { reviewFirstN: 0 });
    const b = reconcile(rules, ai, { reviewFirstN: 0 });
    expect(a).toEqual(b);
    expect(a.findings.map((x) => `${x.id}:${x.origin}:${x.aiSource?.id ?? "-"}`)).toEqual([
      "r1:rule:-",
      "r2:rule+ai:a1",
      "a2:ai:a2",
      "a3:ai:a3",
    ]);
    expect(a.findings.find((x) => x.id === "a3")?.deadline).toBe("none");
  });

  it("does not pair different kinds", () => {
    const { findings } = reconcile(
      [f("r1", { kind: "section", quote: "under section 61", text: "61" })],
      [f("a1", { kind: "reference", quote: "under section 61", text: "61" })],
      { reviewFirstN: 0 },
    );
    expect(findings.map((x) => x.origin)).toEqual(["rule", "ai"]);
  });

  it("matches value kinds by value even when the quotes differ", () => {
    const { findings } = reconcile(
      [
        f("r1", {
          kind: "reference",
          quote: "Reference No. ZD3210260001234",
          text: "ZD3210260001234",
        }),
      ],
      [
        f("a1", {
          kind: "reference",
          quote: "DIN: ZD3210260001234 dated 20.10.2026",
          text: "zd3210260001234",
        }),
      ],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.origin).toBe("rule+ai");
  });
});

describe("quote similarity", () => {
  it("normalises case, spacing and punctuation, and Indic scripts", () => {
    expect(quoteSimilarity("Pay the TAX,  now.", "pay the tax now")).toBe(1);
    expect(
      quoteSimilarity(
        "റിപ്പോർട്ട് 2026 ഓഗസ്റ്റ് 21-ന് മുമ്പ് സമർപ്പിക്കണം.",
        "റിപ്പോർട്ട് 2026 ഓഗസ്റ്റ് 21-ന് മുമ്പ് സമർപ്പിക്കണം",
      ),
    ).toBe(1);
    expect(quoteSimilarity("alpha beta gamma delta", "alpha beta")).toBeCloseTo(0.5);
    expect(quoteSimilarity("", "x")).toBe(0);
    expect(quoteSimilarity("totally different words", "nothing alike here")).toBe(0);
  });
});
