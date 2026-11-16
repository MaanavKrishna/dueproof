/**
 * India — income tax and TDS calendar. DATA ONLY.
 *
 * Sections and rules cited are those of the Income-tax Act 1961 and the
 * Income-tax Rules 1962. The Income-tax Act 2025 is due to replace the 1961
 * Act from 1 April 2026 with new section and form numbers and a "tax year"
 * in place of previous/assessment year: VERIFY whether these dates and forms
 * carry over for periods from FY 2026-27, and add the new citations.
 *
 * Every value is marked `verified: false`. VERIFY AGAINST THE STATUTE IN M0.
 */
import type { StatutoryRule } from "../../types";

const ITD = "https://incometaxindia.gov.in/";

export const directTaxRules: readonly StatutoryRule[] = [
  // ------------------------------------------------------------------ TDS
  {
    key: "in.tds.payment.monthly",
    form: "TDS payment (challan ITNS 281)",
    title: "TDS deposit for the month",
    appliesTo: { kind: "tds" },
    periodType: "month",
    due: {
      type: "day_after_period",
      day: 7,
      monthsAfter: 1,
      overrides: [
        { periodEndMonth: 3, day: 30, monthsAfter: 1, text: "30 April for tax deducted in March" },
      ],
    },
    dueText: "7th of the following month (30 April for March)",
    rollForward: false,
    source: { citation: "Income-tax Rules 1962 r.30(1)(b), r.30(2)", url: ITD },
    verified: false,
    notes:
      "Non-government deductors. Government deductors paying without challan deposit the same day. Separate dates for s.194-IA/IB/M (30 days from month end) are not generated.",
  },
  {
    key: "in.tds.24q.quarterly",
    form: "Form 24Q",
    title: "TDS return on salaries (quarterly)",
    appliesTo: { kind: "tds", match: { files24Q: [null, true] } },
    periodType: "quarter",
    due: {
      type: "day_after_period",
      day: 31,
      monthsAfter: 1,
      overrides: [
        {
          periodEndMonth: 3,
          day: 31,
          monthsAfter: 2,
          text: "31 May for the January–March quarter",
        },
      ],
    },
    dueText: "31st of the month after the quarter (31 May for Q4)",
    rollForward: false,
    source: { citation: "Income-tax Rules 1962 r.31A(2)", url: ITD },
    verified: false,
    notes:
      "Q1 31 Jul, Q2 31 Oct, Q3 31 Jan, Q4 31 May. Late fee s.234E runs per day after the due date.",
  },
  {
    key: "in.tds.26q.quarterly",
    form: "Form 26Q",
    title: "TDS return on payments other than salary (quarterly)",
    appliesTo: { kind: "tds", match: { files26Q: [null, true] } },
    periodType: "quarter",
    due: {
      type: "day_after_period",
      day: 31,
      monthsAfter: 1,
      overrides: [
        {
          periodEndMonth: 3,
          day: 31,
          monthsAfter: 2,
          text: "31 May for the January–March quarter",
        },
      ],
    },
    dueText: "31st of the month after the quarter (31 May for Q4)",
    rollForward: false,
    source: { citation: "Income-tax Rules 1962 r.31A(2)", url: ITD },
    verified: false,
    notes: "Q1 31 Jul, Q2 31 Oct, Q3 31 Jan, Q4 31 May.",
  },

  // ------------------------------------------------------------ advance tax
  {
    key: "in.it.advance_tax.regular",
    form: "Advance tax",
    title: "Advance tax instalment",
    appliesTo: { kind: "income_tax", match: { advanceTax: [null, "regular"] } },
    periodType: "fy_instalment",
    due: {
      type: "instalments",
      dates: [
        { month: 6, day: 15, yearsAfterStart: 0, text: "15 June, 15 % of the year's tax" },
        { month: 9, day: 15, yearsAfterStart: 0, text: "15 September, 45 % of the year's tax" },
        { month: 12, day: 15, yearsAfterStart: 0, text: "15 December, 75 % of the year's tax" },
        { month: 3, day: 15, yearsAfterStart: 1, text: "15 March, 100 % of the year's tax" },
      ],
    },
    dueText: "15 June, 15 September, 15 December and 15 March (15 %, 45 %, 75 %, 100 %)",
    rollForward: false,
    source: { citation: "Income-tax Act 1961 s.211(1)(a)", url: ITD },
    verified: false,
    notes:
      'Applies where the year\'s tax after TDS is ₹10,000 or more (s.208); resident senior citizens without business income are exempt (s.207(2)). Mark advanceTax: "none" on the registration to skip.',
  },
  {
    key: "in.it.advance_tax.presumptive",
    form: "Advance tax",
    title: "Advance tax, single instalment (s.44AD / 44ADA)",
    appliesTo: { kind: "income_tax", match: { advanceTax: ["presumptive"] } },
    periodType: "fy",
    due: { type: "fy_date", month: 3, day: 15, yearsAfterStart: 1 },
    dueText: "15 March of the financial year (whole amount)",
    rollForward: false,
    source: { citation: "Income-tax Act 1961 s.211(1)(b)", url: ITD },
    verified: false,
    notes: "Presumptive taxation under s.44AD/44ADA.",
  },

  // -------------------------------------------------------------------- ITR
  {
    key: "in.it.itr.non_audit",
    form: "ITR",
    title: "Income-tax return (no tax audit)",
    appliesTo: {
      kind: "income_tax",
      match: { audit: [null, false], transferPricing: [null, false] },
    },
    periodType: "fy",
    due: { type: "fy_date", month: 7, day: 31, yearsAfterStart: 1 },
    dueText: "31 July of the assessment year",
    rollForward: false,
    source: { citation: "Income-tax Act 1961 s.139(1), Explanation 2(c)", url: ITD },
    verified: false,
    notes:
      "Verify for FY 2025-26 onward: later due dates for some non-audit business cases have been proposed and extensions are common. Belated return s.139(4) and fee s.234F are not generated.",
  },
  {
    key: "in.it.itr.audit",
    form: "ITR",
    title: "Income-tax return (tax audit or company)",
    appliesTo: { kind: "income_tax", match: { audit: [true], transferPricing: [null, false] } },
    periodType: "fy",
    due: { type: "fy_date", month: 10, day: 31, yearsAfterStart: 1 },
    dueText: "31 October of the assessment year",
    rollForward: false,
    source: { citation: "Income-tax Act 1961 s.139(1), Explanation 2(a)", url: ITD },
    verified: false,
    notes:
      "Companies, and assessees whose accounts must be audited. The tax audit report (Form 3CA/3CB-3CD) is due one month earlier and is not generated in v0.1.",
  },
  {
    key: "in.it.itr.transfer_pricing",
    form: "ITR",
    title: "Income-tax return (transfer pricing report, s.92E)",
    appliesTo: { kind: "income_tax", match: { transferPricing: [true] } },
    periodType: "fy",
    due: { type: "fy_date", month: 11, day: 30, yearsAfterStart: 1 },
    dueText: "30 November of the assessment year",
    rollForward: false,
    source: { citation: "Income-tax Act 1961 s.139(1), Explanation 2(aa)", url: ITD },
    verified: false,
    notes: "Assessees required to furnish a report under s.92E.",
  },
];
