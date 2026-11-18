import type { DateRule } from "@dueproof/contracts";
import { describe, expect, it } from "vitest";
import {
  anchorsInQuote,
  datesInQuote,
  periodsInQuote,
  ruleDerivableFromQuote,
  ruleDerivationIssue,
} from "./reconcile-derive";

const REPLY = "furnish a reply within 30 days of receipt of this notice";

describe("datesInQuote", () => {
  it("reads the formats the engine reads, and only complete, real dates", () => {
    expect(datesInQuote("You are directed to appear on 20.10.2026 at 11 AM")).toEqual([
      "2026-10-20",
    ]);
    expect(datesInQuote("on 20/10/2026 and on 5-1-2027")).toEqual(["2026-10-20", "2027-01-05"]);
    expect(datesInQuote("A personal hearing is fixed on 18 November 2026")).toEqual(["2026-11-18"]);
    expect(datesInQuote("by the 18th of Nov., 2026")).toEqual(["2026-11-18"]);
    expect(datesInQuote("on 18-Nov-2026")).toEqual(["2026-11-18"]);
    expect(datesInQuote("on November 18th, 2026")).toEqual(["2026-11-18"]);
    expect(datesInQuote("Sept 3, 2026")).toEqual(["2026-09-03"]);
    expect(datesInQuote("as on 2026-03-31")).toEqual(["2026-03-31"]);
    expect(datesInQuote("2026 ഓഗസ്റ്റ് 21-ന് മുമ്പ്")).toEqual(["2026-08-21"]);
    expect(datesInQuote("൨൦൨൬ ഓഗസ്റ്റ് ൨൧-ന്")).toEqual(["2026-08-21"]);
    expect(datesInQuote("२० अक्टूबर २०२६ तक")).toEqual(["2026-10-20"]);
  });

  it("does not read a day out of a period, a section or a partial date", () => {
    expect(datesInQuote(REPLY)).toEqual([]);
    expect(datesInQuote("notice under section 7 of the Act")).toEqual([]);
    expect(datesInQuote("on 5 September")).toEqual([]);
    expect(datesInQuote("on 30.02.2026")).toEqual([]);
    expect(datesInQuote("on 20.10.26")).toEqual([]);
    expect(datesInQuote("Ref 120.10.20261")).toEqual([]);
    expect(datesInQuote("the 20 marching bands of 2026")).toEqual([]);
  });
});

describe("periodsInQuote", () => {
  it("reads a number, or a number word, with its unit", () => {
    expect(periodsInQuote(REPLY)).toEqual([{ amount: 30, unit: "days" }]);
    expect(periodsInQuote("within thirty (30) days")).toEqual([{ amount: 30, unit: "days" }]);
    expect(periodsInQuote("within 30 (thirty) days")).toEqual([{ amount: 30, unit: "days" }]);
    expect(periodsInQuote("within twenty-one days")).toEqual([{ amount: 21, unit: "days" }]);
    expect(periodsInQuote("within 15 working days")).toEqual([
      { amount: 15, unit: "working_days" },
    ]);
    expect(periodsInQuote("within a month")).toEqual([{ amount: 1, unit: "months" }]);
    expect(periodsInQuote("within 2 weeks")).toEqual([{ amount: 14, unit: "days" }]);
    expect(periodsInQuote("15 ദിവസത്തിനകം")).toEqual([{ amount: 15, unit: "days" }]);
    expect(periodsInQuote("30 दिनों के भीतर")).toEqual([{ amount: 30, unit: "days" }]);
    expect(periodsInQuote("three months, and a further one month")).toEqual([
      { amount: 3, unit: "months" },
      { amount: 1, unit: "months" },
    ]);
  });

  it("does not read units glued to other words or numbers without units", () => {
    expect(periodsInQuote("section 30 daystar")).toEqual([]);
    expect(periodsInQuote("Rs. 30,000")).toEqual([]);
  });
});

describe("anchorsInQuote", () => {
  it("names what a period runs from", () => {
    expect(anchorsInQuote(REPLY)).toEqual(["receipt"]);
    expect(anchorsInQuote("within 30 days from the date of the order")).toEqual(["order"]);
    expect(anchorsInQuote("within 3 months from the date of communication of the order")).toEqual([
      "service",
    ]);
    expect(anchorsInQuote("within 15 days of the date of this notice")).toEqual(["issue"]);
    expect(anchorsInQuote("within 15 days")).toEqual([]);
  });
});

describe("ruleDerivationIssue", () => {
  const fixed = (date: string): DateRule => ({ type: "fixed", date });
  const rel = (amount: number, anchor = "receipt", unit = "days"): DateRule =>
    ({ type: "relative", anchor, amount, unit }) as DateRule;

  it("a fixed date needs its day, month and year in the quote", () => {
    const q = "You are directed to appear on 20.10.2026 at 11 AM";
    expect(ruleDerivationIssue(fixed("2026-10-20"), q)).toBeNull();
    // The review's probes: wrong month and year; the "30" of "30 days"; a section number.
    expect(ruleDerivationIssue(fixed("2027-12-20"), q)).toBe("fixed_date_not_in_quote");
    expect(ruleDerivationIssue(fixed("2026-12-30"), REPLY)).toBe("fixed_date_not_in_quote");
    expect(ruleDerivationIssue(fixed("2026-12-07"), "notice under section 7 of the Act")).toBe(
      "fixed_date_not_in_quote",
    );
    expect(ruleDerivationIssue(fixed("2026-02-30"), "appear on 30.02.2026")).toBe(
      "fixed_date_not_in_quote",
    );
    // Day and month without a year: the year would be the model's guess.
    expect(ruleDerivationIssue(fixed("2026-09-05"), "on 5 September")).toBe(
      "fixed_date_not_in_quote",
    );
    // Month-first numeric dates are not read: 10/20/2026 is not a date in India.
    expect(ruleDerivationIssue(fixed("2026-10-20"), "on 10/20/2026")).toBe(
      "fixed_date_not_in_quote",
    );
  });

  it("a relative rule needs its amount and unit, and no other named anchor", () => {
    expect(ruleDerivationIssue(rel(30), REPLY)).toBeNull();
    expect(ruleDerivationIssue(rel(90), REPLY)).toBe("relative_period_not_in_quote");
    expect(ruleDerivationIssue(rel(30, "receipt", "months"), REPLY)).toBe(
      "relative_period_not_in_quote",
    );
    expect(ruleDerivationIssue(rel(30, "receipt", "working_days"), REPLY)).toBe(
      "relative_period_not_in_quote",
    );
    expect(ruleDerivationIssue(rel(30, "issue"), REPLY)).toBe("relative_anchor_not_in_quote");
    expect(ruleDerivationIssue(rel(30, "service"), REPLY)).toBe("relative_anchor_not_in_quote");
    // No anchor named: only the earliest reading, from issue.
    expect(ruleDerivationIssue(rel(15, "issue"), "within 15 days")).toBeNull();
    expect(ruleDerivationIssue(rel(15, "receipt"), "within 15 days")).toBe(
      "relative_anchor_not_in_quote",
    );
    expect(ruleDerivationIssue(rel(14, "issue"), "within 2 weeks")).toBeNull();
    expect(ruleDerivationIssue(rel(100_000_000), "within 100000000 days of receipt")).toBe(
      "rule_out_of_bounds",
    );
  });

  it("a condonable period must be written too", () => {
    const q =
      "appeal within three months from the date of communication of the order, and a further period of one month";
    const rule: DateRule = {
      type: "relative",
      anchor: "service",
      amount: 3,
      unit: "months",
      condonable: { amount: 1, unit: "months" },
    };
    expect(ruleDerivationIssue(rule, q)).toBeNull();
    expect(ruleDerivationIssue({ ...rule, condonable: { amount: 6, unit: "months" } }, q)).toBe(
      "condonable_not_in_quote",
    );
  });

  it("a statutory rule needs a real key, a valid period, the form and the period in the quote", () => {
    const st = (ruleKey: string, period: string): DateRule => ({
      type: "statutory",
      ruleKey,
      period,
    });
    expect(
      ruleDerivationIssue(
        st("in.gst.gstr3b.monthly", "2026-10"),
        "file your GSTR-3B return for October 2026",
      ),
    ).toBeNull();
    expect(
      ruleDerivationIssue(st("in.gst.gstr3b.monthly", "2031-01"), "file your return for the month"),
    ).toBe("statutory_form_not_in_quote");
    expect(
      ruleDerivationIssue(
        st("in.gst.gstr3b.monthly", "2031-01"),
        "file your GSTR 3B return for the month",
      ),
    ).toBe("statutory_period_not_in_quote");
    expect(ruleDerivationIssue(st("in.gst.made.up", "2026-10"), "GSTR-3B for October 2026")).toBe(
      "statutory_rule_unknown",
    );
    expect(
      ruleDerivationIssue(st("in.gst.gstr3b.monthly", "FY2025-26"), "GSTR-3B for FY 2025-26"),
    ).toBe("statutory_period_invalid");
    expect(
      ruleDerivationIssue(st("in.gst.gstr9.annual", "FY2025-26"), "GSTR-9 for FY 2025-26"),
    ).toBeNull();
  });

  it("never throws, and rejects malformed rules (adversarial outputs)", () => {
    const bad = [
      null,
      undefined,
      {},
      { type: "fixed" },
      { type: "fixed", date: 20261020 },
      { type: "relative", anchor: "receipt", amount: "30", unit: "days" },
      { type: "relative", anchor: "receipt", amount: 30, unit: "fortnights" },
      { type: "statutory", ruleKey: 7, period: null },
      { type: "lunar", date: "2026-10-20" },
    ] as unknown as DateRule[];
    for (const r of bad) {
      expect(() => ruleDerivationIssue(r, REPLY)).not.toThrow();
      expect(ruleDerivableFromQuote(r, REPLY)).toBe(false);
    }
    expect(ruleDerivableFromQuote({ type: "fixed", date: "2026-10-20" }, 42 as never)).toBe(false);
  });

  it("only dates written in the quote pass (property)", () => {
    let seed = 11;
    const rand = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const months = ["January", "Feb", "March", "Sept", "October", "December"];
    const monthNo = [1, 2, 3, 9, 10, 12];
    for (let i = 0; i < 300; i++) {
      const day = 1 + Math.floor(rand() * 28);
      const mi = Math.floor(rand() * months.length);
      const year = 2020 + Math.floor(rand() * 10);
      const iso = `${year}-${String(monthNo[mi]).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const quotes = [
        `appear on ${day} ${months[mi]} ${year} at 11 AM`,
        `appear on ${String(day).padStart(2, "0")}.${String(monthNo[mi]).padStart(2, "0")}.${year}`,
        `appear on ${months[mi]} ${day}, ${year}`,
      ];
      for (const q of quotes) {
        expect(ruleDerivableFromQuote({ type: "fixed", date: iso }, q), q).toBe(true);
        // Any other day, month or year is refused.
        const other = [
          `${year + 1}${iso.slice(4)}`,
          `${iso.slice(0, 8)}${String(day === 28 ? 1 : day + 1).padStart(2, "0")}`,
        ];
        for (const o of other)
          expect(ruleDerivableFromQuote({ type: "fixed", date: o }, q), `${q} → ${o}`).toBe(false);
      }
    }
  });
});
