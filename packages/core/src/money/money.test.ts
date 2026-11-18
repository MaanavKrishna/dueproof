import { describe, expect, it } from "vitest";
import {
  aggregateExposure,
  dailyInterest,
  divideRounded,
  IN_MONEY_PACK,
  interest234A,
  interest234B,
  interest234C,
  MoneyInputError,
  type MoneyPack,
  monthsOrPart,
  penaltyRange,
} from "./index";

const RUPEE = 100;

describe("integer rounding", () => {
  const r = (mode: "down" | "nearest" | "up", toMinor = 100) => ({ toMinor, mode, citation: "" });
  it.each([
    [150n, 1n, "nearest", 200n],
    [149n, 1n, "nearest", 100n],
    [150n, 1n, "down", 100n],
    [101n, 1n, "up", 200n],
    [-150n, 1n, "nearest", -200n],
    [-150n, 1n, "down", -100n],
    [1n, 3n, "nearest", 0n],
  ] as const)("%s/%s %s → %s", (n, d, mode, want) => {
    expect(divideRounded(n, d, r(mode))).toBe(want);
  });
  it("rounds to ₹100", () => {
    expect(divideRounded(12_345_678n, 1n, r("down", 10_000))).toBe(12_340_000n);
  });
});

describe("months or part of a month", () => {
  it.each([
    ["2026-08-01", "2026-07-31", 0],
    ["2026-08-01", "2026-08-01", 1],
    ["2026-08-01", "2026-08-31", 1],
    ["2026-08-01", "2026-09-01", 2],
    ["2026-08-01", "2026-09-05", 2],
    ["2026-04-01", "2026-07-31", 4],
    ["2026-04-01", "2027-03-31", 12],
    ["2028-02-01", "2028-02-29", 1],
  ] as const)("%s → %s = %s", (a, b, n) => {
    expect(monthsOrPart(a, b)).toBe(n);
    // Both readings agree when the period starts on the 1st.
    expect(monthsOrPart(a, b, "elapsed")).toBe(n);
  });

  // Starts on the 29th-31st, into a shorter month (r.119A(a); verify with a CA).
  it.each([
    ["2027-01-29", "2027-02-28", 2, 1],
    ["2027-01-30", "2027-02-28", 2, 1],
    ["2027-01-31", "2027-02-28", 2, 1],
    ["2027-01-29", "2027-03-01", 3, 2],
    ["2027-01-30", "2027-03-01", 3, 2],
    ["2027-01-31", "2027-03-01", 3, 2],
    ["2027-01-28", "2027-02-28", 2, 2],
    ["2027-01-28", "2027-02-27", 2, 1],
    ["2028-01-31", "2028-02-29", 2, 1],
    // An extended mid-month due date: due 16 Sep, filed 5 Oct.
    ["2025-09-17", "2025-10-05", 2, 1],
    ["2025-09-17", "2025-10-16", 2, 1],
    ["2025-09-17", "2025-10-17", 2, 2],
  ] as const)("%s → %s: %s calendar months, %s elapsed", (a, b, calendar, elapsed) => {
    expect(monthsOrPart(a, b)).toBe(calendar);
    expect(monthsOrPart(a, b, "calendar")).toBe(calendar);
    expect(monthsOrPart(a, b, "elapsed")).toBe(elapsed);
  });

  it("the India pack counts calendar months for 234A and 234B", () => {
    for (const key of ["in.it.s234a", "in.it.s234b", "in.it.s234c"]) {
      const r = IN_MONEY_PACK.interest.find((x) => x.key === key);
      expect(r?.kind === "monthly_simple" && r.monthCounting, key).toBe("calendar");
      expect(r?.verified, key).toBe(false);
    }
  });
});

describe("GST s.50 interest", () => {
  it("₹4,52,300 paid 35 days late at 18 %", () => {
    const r = dailyInterest({
      taxMinor: 452_300 * RUPEE,
      dueOn: "2026-11-20",
      paidOn: "2026-12-25",
    });
    // 45,230,000 × 1800 × 35 / (10,000 × 365) = 780,682.19 paise → ₹7,807 (nearest rupee)
    expect(r.amountMinor).toBe(7_807 * RUPEE);
    expect(r.estimate).toBe(true);
    expect(r.verified).toBe(false);
    expect(r.ruleKey).toBe("in.gst.s50.1");
    expect(r.workings.map((s) => s.label)).toEqual([
      "Period of delay",
      "Interest at 18 % a year",
      "Rounded",
    ]);
    expect(r.workings[0]?.result).toBe("35 days");
    expect(r.workings[1]?.inputs).toMatchObject({
      tax: "₹4,52,300",
      days: "35",
      from: "21 Nov 2026",
      to: "25 Dec 2026",
    });
    expect(r.workings[1]?.result).toBe("₹7,806.82");
    expect(r.workings[2]?.result).toBe("₹7,807");
    expect(r.warnings.join(" ")).toContain("verify in M0");
  });

  it("counts the leap day", () => {
    const leap = dailyInterest({
      taxMinor: 452_300 * RUPEE,
      dueOn: "2028-02-20",
      paidOn: "2028-03-20",
    });
    const plain = dailyInterest({
      taxMinor: 452_300 * RUPEE,
      dueOn: "2027-02-20",
      paidOn: "2027-03-20",
    });
    expect(leap.workings[0]?.result).toBe("29 days");
    expect(plain.workings[0]?.result).toBe("28 days");
    expect(leap.amountMinor).toBe(6_469 * RUPEE); // 646,850.96 paise
  });

  it("is nil when paid on or before the due date", () => {
    expect(
      dailyInterest({ taxMinor: 1_000_000, dueOn: "2026-11-20", paidOn: "2026-11-20" }).amountMinor,
    ).toBe(0);
    expect(
      dailyInterest({ taxMinor: 1_000_000, dueOn: "2026-11-20", paidOn: "2026-11-01" }).amountMinor,
    ).toBe(0);
  });

  it("splits the period across a rate change in the data", () => {
    const pack: MoneyPack = {
      ...IN_MONEY_PACK,
      interest: [
        {
          key: "test.daily",
          kind: "daily_simple",
          section: "test",
          title: "test",
          rates: [
            { from: "2017-07-01", to: "2026-12-31", annualBp: 1800 },
            { from: "2027-01-01", annualBp: 2400 },
          ],
          dayCountBasis: 365,
          resultRounding: { toMinor: 100, mode: "nearest", citation: "nearest rupee" },
          source: { citation: "test", url: "https://example.invalid/" },
          verified: true,
          notes: "",
        },
      ],
    };
    const r = dailyInterest(
      {
        ruleKey: "test.daily",
        taxMinor: 100_000 * RUPEE,
        dueOn: "2026-12-21",
        paidOn: "2027-01-10",
      },
      { pack },
    );
    // 10 days at 18 % + 10 days at 24 % on ₹1,00,000 = 115,068.49 paise → ₹1,151
    expect(r.amountMinor).toBe(1_151 * RUPEE);
    expect(
      r.workings.filter((s) => s.label.startsWith("Interest at")).map((s) => s.inputs.days),
    ).toEqual(["10", "10"]);
    expect(r.warnings).toEqual([]);
  });

  it("s.50(3) is its own rule", () => {
    const r = dailyInterest({
      ruleKey: "in.gst.s50.3",
      taxMinor: 365 * RUPEE * 100,
      dueOn: "2026-01-01",
      paidOn: "2027-01-01",
    });
    expect(r.amountMinor).toBe(6_570 * RUPEE); // 18 % of ₹36,500 for 365 days
  });

  it("rejects bad inputs", () => {
    expect(() =>
      dailyInterest({ taxMinor: 1.5, dueOn: "2026-11-20", paidOn: "2026-12-01" }),
    ).toThrow(RangeError);
    expect(() =>
      dailyInterest({ taxMinor: -1, dueOn: "2026-11-20", paidOn: "2026-12-01" }),
    ).toThrow(MoneyInputError);
    expect(() => dailyInterest({ taxMinor: 1, dueOn: "2026-11-31", paidOn: "2026-12-01" })).toThrow(
      MoneyInputError,
    );
    expect(() =>
      dailyInterest({
        ruleKey: "in.it.s234a",
        taxMinor: 1,
        dueOn: "2026-11-20",
        paidOn: "2026-12-01",
      }),
    ).toThrow(MoneyInputError);
  });
});

describe("income-tax s.234A", () => {
  it("1 % a month or part, on tax rounded down to ₹100", () => {
    const r = interest234A({ taxMinor: 12_345_678, dueOn: "2026-07-31", filedOn: "2026-09-05" });
    // ₹1,23,456.78 → ₹1,23,400 × 1 % × 2 months = ₹2,468
    expect(r.amountMinor).toBe(2_468 * RUPEE);
    expect(r.workings.map((s) => s.result)).toEqual(["2 months", "₹1,23,400", "₹2,468"]);
  });
  it.each([
    ["2026-07-31", 0],
    ["2026-08-01", 1_234 * RUPEE],
    ["2026-08-31", 1_234 * RUPEE],
    ["2026-09-01", 2_468 * RUPEE],
  ] as const)("filed %s → %s", (filedOn, want) => {
    expect(interest234A({ taxMinor: 12_345_678, dueOn: "2026-07-31", filedOn }).amountMinor).toBe(
      want,
    );
  });
});

describe("income-tax s.234A, extended mid-month due date", () => {
  it("due 16 Sep, filed 5 Oct: September and October, 2 months", () => {
    const r = interest234A({
      taxMinor: 100_000 * RUPEE,
      dueOn: "2025-09-16",
      filedOn: "2025-10-05",
    });
    expect(r.amountMinor).toBe(2_000 * RUPEE);
    expect(r.workings[0]?.result).toBe("2 months");
  });
});

describe("income-tax s.234B", () => {
  it("no interest when assessed tax is below ₹10,000 (s.208)", () => {
    const r = interest234B({
      assessedTaxMinor: 5_000 * RUPEE,
      advanceTaxPaidMinor: 0,
      fy: "FY2025-26",
      untilOn: "2026-07-31",
    });
    expect(r.amountMinor).toBe(0);
    expect(r.workings[0]?.formula).toContain("s.208");
    expect(r.workings[0]?.result).toBe("No");
  });
  it("applies from exactly ₹10,000", () => {
    const r = interest234B({
      assessedTaxMinor: 10_000 * RUPEE,
      advanceTaxPaidMinor: 0,
      fy: "FY2025-26",
      untilOn: "2026-07-31",
    });
    // ₹10,000 × 1 % × 4 months
    expect(r.amountMinor).toBe(400 * RUPEE);
  });
  it("advance tax below 90 %: shortfall × 1 % × months from 1 April of the AY", () => {
    const r = interest234B({
      assessedTaxMinor: 1_000_000 * RUPEE,
      advanceTaxPaidMinor: 800_000 * RUPEE,
      fy: "FY2025-26",
      untilOn: "2026-07-31",
    });
    expect(r.amountMinor).toBe(8_000 * RUPEE);
    expect(r.workings.find((s) => s.label === "Period")?.result).toBe("4 months");
    expect(r.workings.find((s) => s.label === "Period")?.inputs.from).toBe("1 Apr 2026");
    expect(r.warnings.join(" ")).toContain("s.234B(2)");
  });
  it("one more day is one more month", () => {
    const r = interest234B({
      assessedTaxMinor: 1_000_000 * RUPEE,
      advanceTaxPaidMinor: 800_000 * RUPEE,
      fy: "FY2025-26",
      untilOn: "2026-08-01",
    });
    expect(r.amountMinor).toBe(10_000 * RUPEE);
  });
  it("no interest at exactly 90 %", () => {
    const r = interest234B({
      assessedTaxMinor: 1_000_000 * RUPEE,
      advanceTaxPaidMinor: 900_000 * RUPEE,
      fy: "FY2025-26",
      untilOn: "2026-12-31",
    });
    expect(r.amountMinor).toBe(0);
  });
  it("rejects a bad FY", () => {
    expect(() =>
      interest234B({
        assessedTaxMinor: 1,
        advanceTaxPaidMinor: 0,
        fy: "2025-26",
        untilOn: "2026-12-31",
      }),
    ).toThrow(MoneyInputError);
  });
});

describe("income-tax s.234C", () => {
  const taxDueMinor = 100_000 * RUPEE;
  const pay = (paidOn: string, rupees: number) => ({ paidOn, amountMinor: rupees * RUPEE });

  it("regular: safe harbour on instalment 2, shortfalls on 1 and 3", () => {
    const r = interest234C({
      taxDueMinor,
      fy: "FY2026-27",
      payments: [
        pay("2026-06-15", 10_000),
        pay("2026-09-15", 30_000),
        pay("2026-12-15", 30_000),
        pay("2027-03-15", 30_000),
      ],
    });
    // I1: 15,000 − 10,000 = 5,000 × 3 % = 150 · I2: 40 % ≥ 36 % · I3: 75,000 − 70,000 = 5,000 × 3 % = 150 · I4: none
    expect(r.amountMinor).toBe(300 * RUPEE);
    expect(r.workings.at(-1)?.result).toBe("₹300");
    expect(r.workings.some((s) => s.formula.includes("36 %"))).toBe(true);
  });

  it("a payment one day late does not count for the instalment", () => {
    const r = interest234C({
      taxDueMinor,
      fy: "FY2026-27",
      payments: [
        pay("2026-06-16", 15_000),
        pay("2026-09-15", 30_000),
        pay("2026-12-15", 30_000),
        pay("2027-03-15", 25_000),
      ],
    });
    expect(r.amountMinor).toBe(450 * RUPEE);
  });

  it("first-instalment safe harbour at 12 %", () => {
    const r = interest234C({
      taxDueMinor,
      fy: "FY2026-27",
      payments: [
        pay("2026-06-15", 12_000),
        pay("2026-09-15", 33_000),
        pay("2026-12-15", 30_000),
        pay("2027-03-15", 25_000),
      ],
    });
    expect(r.amountMinor).toBe(0);
  });

  it("rounds each shortfall down to ₹100", () => {
    const r = interest234C({
      taxDueMinor,
      fy: "FY2026-27",
      payments: [
        pay("2026-06-15", 15_000),
        pay("2026-09-15", 30_000),
        pay("2026-12-15", 30_000),
        pay("2027-03-15", 24_950),
      ],
    });
    // I4 shortfall ₹50 → rounded down to ₹0
    expect(r.amountMinor).toBe(0);
  });

  it("presumptive: one instalment, one month", () => {
    const r = interest234C({
      taxDueMinor: 50_000 * RUPEE,
      fy: "FY2026-27",
      scheme: "presumptive",
      payments: [pay("2027-03-15", 40_000)],
    });
    expect(r.amountMinor).toBe(100 * RUPEE);
  });

  it("no interest when tax due is below ₹10,000 (s.208)", () => {
    const r = interest234C({ taxDueMinor: 5_000 * RUPEE, fy: "FY2025-26", payments: [] });
    expect(r.amountMinor).toBe(0);
    expect(r.workings[0]?.formula).toContain("s.208");
  });

  it("nothing paid on ₹1,00,000: ₹5,050", () => {
    const r = interest234C({ taxDueMinor, fy: "FY2025-26", payments: [] });
    // 15,000 × 3 % + 45,000 × 3 % + 75,000 × 3 % + 1,00,000 × 1 %
    expect(r.amountMinor).toBe(5_050 * RUPEE);
  });

  it("ignores payments dated outside the financial year, and says so", () => {
    const r = interest234C({
      taxDueMinor,
      fy: "FY2025-26",
      payments: [pay("2025-03-31", 100_000), pay("2026-04-01", 100_000)],
    });
    expect(r.amountMinor).toBe(5_050 * RUPEE);
    expect(r.warnings[0]).toBe(
      "2 payments are dated outside FY2025-26 (1 Apr 2025 to 31 Mar 2026) and not counted.",
    );
    const inYear = interest234C({
      taxDueMinor,
      fy: "FY2025-26",
      payments: [pay("2025-04-01", 100_000)],
    });
    expect(inYear.amountMinor).toBe(0);
    expect(inYear.warnings.join(" ")).not.toContain("outside");
  });

  it("rejects an unknown scheme", () => {
    expect(() => interest234C({ taxDueMinor, fy: "FY2026-27", scheme: "x", payments: [] })).toThrow(
      MoneyInputError,
    );
  });
});

describe("penalty ranges", () => {
  it("s.73: nil to the higher of 10 % and ₹10,000", () => {
    const small = penaltyRange("in.gst.s73", 50_000 * RUPEE);
    expect([small.lowMinor, small.highMinor]).toEqual([0, 10_000 * RUPEE]);
    const big = penaltyRange("in.gst.s73", 452_300 * RUPEE);
    expect(big.highMinor).toBe(45_230 * RUPEE);
    expect(big.workings[1]?.formula).toBe("the higher of 10 % of tax and ₹10,000");
    expect(big.estimate).toBe(true);
    expect(big.verified).toBe(false);
  });
  it("s.74: 15 % to 100 %", () => {
    const r = penaltyRange("in.gst.s74", 452_300 * RUPEE);
    expect([r.lowMinor, r.highMinor]).toEqual([67_845 * RUPEE, 452_300 * RUPEE]);
  });
  it("s.270A: 50 % to 200 %, rounded to the rupee", () => {
    const r = penaltyRange("in.it.s270a", 100_001 * RUPEE);
    expect([r.lowMinor, r.highMinor]).toEqual([50_001 * RUPEE, 200_002 * RUPEE]);
  });
  it("s.125 and s.234F are fixed ranges", () => {
    expect(penaltyRange("in.gst.s125", 0).highMinor).toBe(25_000 * RUPEE);
    const f = penaltyRange("in.it.s234f", 0);
    expect([f.lowMinor, f.highMinor]).toEqual([1_000 * RUPEE, 5_000 * RUPEE]);
  });
  it("every penalty in the pack is unverified, sourced and low ≤ high", () => {
    for (const p of IN_MONEY_PACK.penalties) {
      expect(p.verified, p.key).toBe(false);
      expect(p.source.url).toMatch(/^https:\/\//);
      for (const base of [0, 1, 999_999, 123_456_789_00]) {
        const r = penaltyRange(p.key, base);
        expect(r.lowMinor, p.key).toBeLessThanOrEqual(r.highMinor);
      }
    }
    for (const r of IN_MONEY_PACK.interest) expect(r.verified, r.key).toBe(false);
  });
  it("rejects unknown keys and negative bases", () => {
    expect(() => penaltyRange("nope", 1)).toThrow(MoneyInputError);
    expect(() => penaltyRange("in.gst.s74", -1)).toThrow(MoneyInputError);
  });
});

describe("exposure", () => {
  const e = aggregateExposure(
    [
      {
        clientId: "harbour",
        caseId: "k1",
        taxType: "gst",
        stage: "received",
        head: "tax",
        status: "open",
        amountMinor: 452_300_00,
      },
      {
        clientId: "harbour",
        caseId: "k1",
        taxType: "gst",
        stage: "received",
        head: "penalty",
        status: "open",
        amountMinor: 45_230_00,
      },
      {
        clientId: "harbour",
        caseId: "k2",
        taxType: "income_tax",
        stage: "appeal",
        head: "tax",
        status: "stayed",
        amountMinor: 1_000_000_00,
      },
      {
        clientId: "acme",
        caseId: "k3",
        taxType: "income_tax",
        head: "tax",
        status: "open",
        amountMinor: 600_000_00,
      },
      {
        clientId: "acme",
        caseId: "k4",
        taxType: "gst",
        head: "tax",
        status: "paid",
        amountMinor: 10_000_00,
      },
      {
        clientId: "zen",
        caseId: "k5",
        taxType: "gst",
        head: "fee",
        status: "dropped",
        amountMinor: 5_000_00,
      },
    ],
    [
      {
        clientId: "harbour",
        caseId: "k1",
        taxType: "gst",
        stage: "received",
        interestMinor: 7_807_00,
        penaltyLowMinor: 0,
        penaltyHighMinor: 45_230_00,
      },
      { clientId: "acme", caseId: "k3", taxType: "income_tax", interestMinor: 8_000_00 },
    ],
  );

  it("firm totals", () => {
    expect(e.firm.openMinor).toBe(1_097_530_00);
    expect(e.firm.stayedMinor).toBe(1_000_000_00);
    expect(e.firm.paidMinor).toBe(10_000_00);
    expect(e.firm.droppedMinor).toBe(5_000_00);
    expect(e.firm.computedInterestMinor).toBe(15_807_00);
    expect([e.firm.penaltyLowMinor, e.firm.penaltyHighMinor]).toEqual([0, 45_230_00]);
    expect(e.firm.openByHead).toEqual({
      tax: 1_052_300_00,
      interest: 0,
      penalty: 45_230_00,
      fee: 0,
    });
    expect(Object.keys(e.firm.byTaxType)).toEqual(["gst", "income_tax"]);
    expect(e.firm.byTaxType.gst?.openMinor).toBe(497_530_00);
    expect(e.firm.byStage.unstaged?.openMinor).toBe(600_000_00);
  });

  it("per client, and ranked", () => {
    expect(e.clients.harbour?.openMinor).toBe(497_530_00);
    expect(e.clients.acme?.computedInterestMinor).toBe(8_000_00);
    expect(e.clients.zen?.openMinor).toBe(0);
    expect(e.ranking.map((r) => r.clientId)).toEqual(["acme", "harbour", "zen"]);
  });

  it("is empty for no input and rejects fractional amounts", () => {
    expect(aggregateExposure([]).firm.openMinor).toBe(0);
    expect(() =>
      aggregateExposure([
        { clientId: "a", taxType: "gst", head: "tax", status: "open", amountMinor: 0.5 },
      ]),
    ).toThrow(RangeError);
  });
});
