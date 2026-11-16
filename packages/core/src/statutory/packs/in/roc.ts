/**
 * India — ROC annual filings under the Companies Act 2013. DATA ONLY.
 * Every value is marked `verified: false`. VERIFY AGAINST THE STATUTE IN M0.
 */
import type { StatutoryRule } from "../../types";

const MCA = "https://www.mca.gov.in/";

/** s.96(1): the AGM within six months of the FY's close, i.e. 30 Sep for a March year end. */
const AGM_LAST_DAY = {
  month: 9,
  day: 30,
  yearsAfterStart: 1,
  text: "AGM date not recorded: counted from 30 September, the last day for the AGM under s.96(1)",
} as const;

const NOT_OPC = { companyType: [null, "private", "public", "small", "listed"] } as const;

export const rocRules: readonly StatutoryRule[] = [
  {
    key: "in.roc.aoc4",
    form: "AOC-4",
    title: "Financial statements (AOC-4)",
    appliesTo: { kind: "roc", match: NOT_OPC },
    periodType: "fy",
    due: { type: "days_after_event", event: "agm", days: 30, fallback: AGM_LAST_DAY },
    dueText: "30 days from the AGM",
    rollForward: false,
    source: {
      citation: "Companies Act 2013 s.137(1); Companies (Accounts) Rules 2014 r.12",
      url: MCA,
    },
    verified: false,
    notes:
      "AOC-4 XBRL / CFS variants share the date. A first AGM may be held within nine months of the first FY's close: record the AGM date. Additional fees accrue per day after the due date.",
  },
  {
    key: "in.roc.aoc4.opc",
    form: "AOC-4",
    title: "Financial statements (AOC-4, one person company)",
    appliesTo: { kind: "roc", match: { companyType: ["opc"] } },
    periodType: "fy",
    due: { type: "fy_date", month: 9, day: 27, yearsAfterStart: 1 },
    dueText: "180 days from the close of the financial year (27 September)",
    rollForward: false,
    source: { citation: "Companies Act 2013 s.137(1) first proviso", url: MCA },
    verified: false,
    notes: "OPCs hold no AGM.",
  },
  {
    key: "in.roc.mgt7",
    form: "MGT-7",
    title: "Annual return (MGT-7 / MGT-7A)",
    appliesTo: { kind: "roc" },
    periodType: "fy",
    due: { type: "days_after_event", event: "agm", days: 60, fallback: AGM_LAST_DAY },
    dueText: "60 days from the AGM",
    rollForward: false,
    source: {
      citation:
        "Companies Act 2013 s.92(4); Companies (Management and Administration) Rules 2014 r.11",
      url: MCA,
    },
    verified: false,
    notes:
      "Small companies and OPCs file MGT-7A. For an OPC (no AGM) the date runs from the last day the AGM would have been due: verify.",
  },
];
