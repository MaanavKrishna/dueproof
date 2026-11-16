/**
 * India — interest rates and penalty ranges. DATA ONLY.
 *
 * Every rate, rounding rule and penalty bound is the author's best
 * understanding and is marked `verified: false`: VERIFY AGAINST THE STATUTE
 * AND CURRENT NOTIFICATIONS IN M0; a practising CA signs off before release.
 * Income-tax sections are those of the 1961 Act; the Income-tax Act 2025
 * renumbers them from 1 April 2026 (verify and add the new citations).
 */
import type { MoneyPack, Rounding } from "../../../money/types";

const CBIC = "https://cbic-gst.gov.in/";
const ITD = "https://incometaxindia.gov.in/";

const GST_NEAREST_RUPEE: Rounding = {
  toMinor: 100,
  mode: "nearest",
  citation: "CGST Act 2017 s.170 (tax, interest and penalty rounded to the nearest rupee)",
};
const IT_PRINCIPAL_DOWN_100: Rounding = {
  toMinor: 10_000,
  mode: "down",
  citation: "Income-tax Rules 1962 r.119A(b) (amount rounded down to a multiple of ₹100)",
};
const IT_RESULT_RUPEE: Rounding = {
  toMinor: 100,
  mode: "nearest",
  citation:
    "Whole rupees; s.288B rounds the total payable to the nearest ₹10, which is not applied here",
};

export const IN_MONEY_PACK: MoneyPack = {
  country: "in",
  version: "in-money-2026.11.0-draft",
  asOf: "2026-11-16",
  currency: "INR",
  penaltyRounding: {
    toMinor: 100,
    mode: "nearest",
    citation: "Nearest rupee (CGST Act s.170; income-tax amounts are in whole rupees)",
  },
  interest: [
    {
      key: "in.gst.s50.1",
      kind: "daily_simple",
      section: "CGST Act s.50(1)",
      title: "GST interest on tax paid late",
      rates: [{ from: "2017-07-01", annualBp: 1800 }],
      dayCountBasis: 365,
      resultRounding: GST_NEAREST_RUPEE,
      source: {
        citation: "CGST Act 2017 s.50(1); Notification 13/2017-Central Tax (rate)",
        url: CBIC,
      },
      verified: false,
      notes:
        "18 % a year on tax paid late, from the day after the due date to the day of payment. Since the 2021 amendment (effective 1 Jul 2017) interest is on the part paid in cash where the return was filed: enter that amount. Same again under SGST/UTGST for the state share.",
    },
    {
      key: "in.gst.s50.3",
      kind: "daily_simple",
      section: "CGST Act s.50(3)",
      title: "GST interest on input tax credit wrongly availed and utilised",
      rates: [{ from: "2017-07-01", annualBp: 1800 }],
      dayCountBasis: 365,
      resultRounding: GST_NEAREST_RUPEE,
      source: {
        citation: "CGST Act 2017 s.50(3) (as substituted by Finance Act 2022); CGST Rules r.88B",
        url: CBIC,
      },
      verified: false,
      notes:
        "Originally 24 %; 18 % after the Finance Act 2022 substitution with effect from 1 Jul 2017 (verify). Runs from the date of utilisation to the date of reversal or payment.",
    },
    {
      key: "in.it.s234a",
      kind: "monthly_simple",
      section: "Income-tax Act 1961 s.234A",
      title: "Interest for a late income-tax return",
      monthlyBp: 100,
      principalRounding: IT_PRINCIPAL_DOWN_100,
      resultRounding: IT_RESULT_RUPEE,
      partMonthIsFull: true,
      source: { citation: "Income-tax Act 1961 s.234A; Income-tax Rules r.119A", url: ITD },
      verified: false,
      notes:
        "1 % a month or part of a month on the tax on returned/assessed income less advance tax, TDS/TCS and reliefs, from the day after the return due date to the date of filing.",
    },
    {
      key: "in.it.s234b",
      kind: "monthly_simple",
      section: "Income-tax Act 1961 s.234B",
      title: "Interest for short payment of advance tax",
      monthlyBp: 100,
      principalRounding: IT_PRINCIPAL_DOWN_100,
      resultRounding: IT_RESULT_RUPEE,
      partMonthIsFull: true,
      thresholdBp: 9000,
      startsOn: { month: 4, day: 1, yearsAfterStart: 1 },
      source: { citation: "Income-tax Act 1961 s.234B; Income-tax Rules r.119A", url: ITD },
      verified: false,
      notes:
        "Applies when advance tax paid is below 90 % of assessed tax. 1 % a month or part from 1 April of the assessment year to the date of determination. Self-assessment tax paid part-way (s.234B(2)) is not modelled: enter the date it was paid as the end date.",
    },
    {
      key: "in.it.s234c",
      kind: "monthly_simple",
      section: "Income-tax Act 1961 s.234C",
      title: "Interest for deferment of advance-tax instalments",
      monthlyBp: 100,
      principalRounding: IT_PRINCIPAL_DOWN_100,
      resultRounding: IT_RESULT_RUPEE,
      partMonthIsFull: true,
      instalments: {
        regular: [
          {
            due: { month: 6, day: 15, yearsAfterStart: 0 },
            cumulativeBp: 1500,
            safeHarbourBp: 1200,
            months: 3,
          },
          {
            due: { month: 9, day: 15, yearsAfterStart: 0 },
            cumulativeBp: 4500,
            safeHarbourBp: 3600,
            months: 3,
          },
          { due: { month: 12, day: 15, yearsAfterStart: 0 }, cumulativeBp: 7500, months: 3 },
          { due: { month: 3, day: 15, yearsAfterStart: 1 }, cumulativeBp: 10_000, months: 1 },
        ],
        presumptive: [
          { due: { month: 3, day: 15, yearsAfterStart: 1 }, cumulativeBp: 10_000, months: 1 },
        ],
      },
      source: { citation: "Income-tax Act 1961 s.234C(1); Income-tax Rules r.119A", url: ITD },
      verified: false,
      notes:
        "Tax due is the tax on returned income less TDS/TCS and reliefs. Shortfalls arising only from capital gains or dividends after an instalment date are excluded by the proviso: adjust the inputs. 12 % and 36 % safe harbours apply to the first two instalments.",
    },
  ],
  penalties: [
    {
      key: "in.gst.s73",
      section: "CGST Act s.73(9)",
      title: "Penalty, tax not paid (no fraud), up to FY 2023-24",
      baseLabel: "tax",
      low: { type: "zero" },
      high: {
        type: "max",
        of: [
          { type: "pct", bp: 1000 },
          { type: "fixed", minor: 1_000_000 },
        ],
      },
      lowWhen: "Tax and interest paid within 30 days of the show cause notice (s.73(8))",
      highWhen: "On adjudication: the higher of 10 % of tax and ₹10,000",
      source: { citation: "CGST Act 2017 s.73(8), s.73(9)", url: CBIC },
      verified: false,
      notes:
        "For periods up to FY 2023-24; s.74A applies from FY 2024-25. Per Act (CGST); SGST is separate.",
    },
    {
      key: "in.gst.s74",
      section: "CGST Act s.74",
      title: "Penalty, fraud or suppression, up to FY 2023-24",
      baseLabel: "tax",
      low: { type: "pct", bp: 1500 },
      high: { type: "pct", bp: 10_000 },
      lowWhen: "Tax, interest and 15 % penalty paid before the show cause notice (s.74(5))",
      highWhen: "On adjudication: penalty equal to the tax (s.74(9))",
      source: { citation: "CGST Act 2017 s.74(5)–(11)", url: CBIC },
      verified: false,
      notes: "Intermediate rates of 25 % and 50 % apply at later stages (s.74(8), s.74(11)).",
    },
    {
      key: "in.gst.s74a.non_fraud",
      section: "CGST Act s.74A(5)(i)",
      title: "Penalty, tax not paid (no fraud), from FY 2024-25",
      baseLabel: "tax",
      low: { type: "zero" },
      high: {
        type: "max",
        of: [
          { type: "pct", bp: 1000 },
          { type: "fixed", minor: 1_000_000 },
        ],
      },
      lowWhen: "Tax and interest paid within 60 days of the notice (s.74A(8))",
      highWhen: "The higher of 10 % of tax and ₹10,000",
      source: { citation: "CGST Act 2017 s.74A (inserted by Finance (No. 2) Act 2024)", url: CBIC },
      verified: false,
      notes: "Verify the section text and the periods it covers.",
    },
    {
      key: "in.gst.s125",
      section: "CGST Act s.125",
      title: "General penalty",
      baseLabel: "tax",
      low: { type: "zero" },
      high: { type: "fixed", minor: 2_500_000 },
      lowWhen: "No penalty imposed",
      highWhen: "Up to ₹25,000",
      source: { citation: "CGST Act 2017 s.125", url: CBIC },
      verified: false,
      notes: "Per Act: the same again under the SGST Act.",
    },
    {
      key: "in.it.s270a",
      section: "Income-tax Act 1961 s.270A",
      title: "Penalty for under-reporting or misreporting income",
      baseLabel: "tax on under-reported income",
      low: { type: "pct", bp: 5000 },
      high: { type: "pct", bp: 20_000 },
      lowWhen: "Under-reporting: 50 % of the tax (s.270A(7))",
      highWhen: "Misreporting: 200 % of the tax (s.270A(8))",
      source: { citation: "Income-tax Act 1961 s.270A(7), (8)", url: ITD },
      verified: false,
      notes: "Immunity under s.270AA may reduce this to nil: not shown as the low end.",
    },
    {
      key: "in.it.s271_1c",
      section: "Income-tax Act 1961 s.271(1)(c)",
      title: "Penalty for concealment (assessment years up to 2016-17)",
      baseLabel: "tax sought to be evaded",
      low: { type: "pct", bp: 10_000 },
      high: { type: "pct", bp: 30_000 },
      lowWhen: "100 % of the tax sought to be evaded",
      highWhen: "300 % of the tax sought to be evaded",
      source: { citation: "Income-tax Act 1961 s.271(1)(c), (iii)", url: ITD },
      verified: false,
      notes: "Legacy provision; still seen in older notices.",
    },
    {
      key: "in.it.s234f",
      section: "Income-tax Act 1961 s.234F",
      title: "Fee for a late income-tax return",
      baseLabel: "tax",
      low: { type: "fixed", minor: 100_000 },
      high: { type: "fixed", minor: 500_000 },
      lowWhen: "Total income up to ₹5 lakh: ₹1,000",
      highWhen: "Otherwise: ₹5,000",
      source: { citation: "Income-tax Act 1961 s.234F", url: ITD },
      verified: false,
      notes: "A fee, not a penalty; shown as a range because it depends on total income.",
    },
  ],
};
