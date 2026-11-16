import { describe, expect, it } from "vitest";
import { amountsInQuote, dateFieldsOutsideRule, quoteHasDay, validateExtraction } from "./schema";

const good = {
  kind: "deadline",
  text: "Explain the discrepancies and pay the tax",
  textEn: null,
  quote: "pay the tax of Rs. 4,52,300 with interest within 30 days of receipt of this notice",
  quoteLang: "en",
  pageHint: 1,
  confidence: 0.9,
  dueRule: { type: "relative", anchor: "receipt", amount: 30, unit: "days", condonable: null },
  amountMinor: 45230000,
  desk: "Finance",
  severity: "high",
};

const validate = (findings: unknown[]) =>
  validateExtraction({ findings }, { level: "sonnet", pageCount: 1 });

describe("validateExtraction", () => {
  it("accepts a well-formed finding and maps it to EngineFinding", () => {
    const r = validate([good]);
    expect(r.ok).toBe(true);
    expect(r.rejected).toEqual([]);
    expect(r.findings[0]?.id).toBe("ai-sonnet-0");
    expect(r.findings[0]?.finding).toEqual({
      kind: "deadline",
      text: good.text,
      quote: good.quote,
      quoteLang: "en",
      pageHint: 1,
      confidence: 0.9,
      dueRule: { type: "relative", anchor: "receipt", amount: 30, unit: "days" },
      amountMinor: 45230000,
      desk: "Finance",
      severity: "high",
    });
  });

  it("rejects a computed date in any field outside the DateRule", () => {
    for (const extra of [
      { dueOn: "2026-11-23" },
      { dueDate: "2026-11-23" },
      { deadline: "23 Nov" },
    ]) {
      const r = validate([{ ...good, ...extra }]);
      expect(r.findings).toEqual([]);
      expect(r.rejected[0]?.reasons).toContain("date_field_outside_rule");
    }
    expect(dateFieldsOutsideRule({ ...good, nested: { when: "x" } })).toEqual(["nested.when"]);
    // A date inside the DateRule is fine.
    expect(dateFieldsOutsideRule(good)).toEqual([]);
  });

  it("rejects malformed findings one by one and keeps the rest", () => {
    const r = validate([
      good,
      { ...good, kind: "verdict" },
      { ...good, confidence: 7 },
      {
        ...good,
        dueRule: { type: "relative", anchor: "moon", amount: 30, unit: "days", condonable: null },
      },
      { ...good, dueRule: { type: "fixed", date: "next Tuesday" } },
      { ...good, pageHint: 9 },
      "not an object",
    ]);
    expect(r.findings.map((f) => f.id)).toEqual(["ai-sonnet-0"]);
    expect(r.rejected.map((x) => x.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.rejected.find((x) => x.index === 5)?.reasons).toEqual(["page_out_of_range"]);
  });

  it("fails the whole output when it is not JSON or not the top-level shape", () => {
    expect(validateExtraction("not json", { level: "haiku" }).ok).toBe(false);
    expect(validateExtraction({ findings: [], note: "hi" }, { level: "haiku" }).ok).toBe(false);
    expect(validateExtraction([good], { level: "haiku" }).ok).toBe(false);
  });

  it("drops a fixed date the quote does not state (the model may copy a date, never compute one)", () => {
    const quoteSays = {
      ...good,
      amountMinor: null,
      quote: "A personal hearing is fixed on 18 November 2026",
      dueRule: { type: "fixed", date: "2026-11-18" },
    };
    expect(validate([quoteSays]).findings[0]?.finding.dueRule).toEqual({
      type: "fixed",
      date: "2026-11-18",
    });
    const computed = {
      ...quoteSays,
      quote: "reply within 30 days of receipt of this notice",
      dueRule: { type: "fixed", date: "2026-11-23" },
    };
    const r = validate([computed]).findings[0];
    expect(r?.finding.dueRule).toBeUndefined();
    expect(r?.issues).toContain("fixed_date_not_in_quote");
  });

  it("reads Malayalam digits and dates written day-last", () => {
    expect(quoteHasDay("2026 ഓഗസ്റ്റ് 21-ന് മുമ്പ്", "2026-08-21")).toBe(true);
    expect(quoteHasDay("൨൦൨൬ ഓഗസ്റ്റ് ൨൧-ന്", "2026-08-21")).toBe(true);
    expect(quoteHasDay("on or before 21 August 2026", "2026-08-12")).toBe(false);
    expect(quoteHasDay("on 5 September", "2026-09-05")).toBe(true);
    expect(quoteHasDay("on 15 September", "2026-09-05")).toBe(false);
  });

  it("drops an amount the quote does not state (no model arithmetic)", () => {
    expect(amountsInQuote("pay the tax of Rs. 4,52,300 with interest")).toContain(45230000);
    expect(amountsInQuote("a penalty of Rs. 2.5 lakh")).toContain(25000000);
    expect(amountsInQuote("budget of 412 crore")).toContain(412 * 1e7 * 100);
    const summed = validate([{ ...good, amountMinor: 70230000 }]).findings[0];
    expect(summed?.finding.amountMinor).toBeUndefined();
    expect(summed?.issues).toContain("amount_not_in_quote");
  });

  it("replaces display text that carries an ISO date the page does not", () => {
    const r = validate([{ ...good, text: "Reply by 2026-11-23" }]).findings[0];
    expect(r?.finding.text).toBe(good.quote);
    expect(r?.issues).toContain("date_in_text_not_in_quote");
  });
});
