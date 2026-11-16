import type { engine, Verification } from "@dueproof/contracts";
import { describe, expect, it } from "vitest";
import { type GradedFinding, quoteSimilarity, reconcile } from "./reconcile";

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

  it("with a date context, conflicts carry both dates, and equal dates are not a conflict", () => {
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
    expect(same.findings[0]).toMatchObject({ status: "verified", conflicts: [] });
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

  it("a merged pair takes the AI date only when the rule had none", () => {
    const { findings } = reconcile(
      [f("r1", { kind: "obligation", quote: REPLY_QUOTE })],
      [f("a1", { kind: "deadline", quote: REPLY_QUOTE, dueRule: reply30 })],
    );
    expect(findings[0]).toMatchObject({ origin: "rule+ai", dueRule: reply30, deadline: "auto" });
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
