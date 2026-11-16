/**
 * India — GST (central) filing calendar. DATA ONLY.
 *
 * Every value is the author's best understanding and is marked
 * `verified: false`: VERIFY AGAINST THE STATUTE AND CURRENT NOTIFICATIONS
 * IN M0, and have a practising CA sign off before release (03 §8a).
 */
import type { StatutoryRule } from "../../types";

const CBIC_NOTIFICATIONS = "https://cbic-gst.gov.in/central-tax-notifications.html";

/** Regular (non-QRMP, non-composition) monthly filers. */
const MONTHLY = { frequency: ["monthly"], scheme: [null, "regular"] } as const;
/** QRMP: quarterly return filers (CGST Rules r.61A). */
const QRMP = { frequency: ["quarterly"], scheme: [null, "qrmp"] } as const;

export const gstRules: readonly StatutoryRule[] = [
  {
    key: "in.gst.gstr1.monthly",
    form: "GSTR-1",
    title: "GSTR-1 outward supplies (monthly)",
    appliesTo: { kind: "gst", match: MONTHLY },
    periodType: "month",
    due: { type: "day_after_period", day: 11, monthsAfter: 1 },
    dueText: "11th of the following month",
    rollForward: false,
    source: {
      citation: "CGST Act 2017 s.37(1); CGST Rules r.59(1); Notification 83/2020-Central Tax",
      url: CBIC_NOTIFICATIONS,
    },
    verified: false,
    notes:
      "Verify the day against the current notification; extensions are issued as dated overrides.",
  },
  {
    key: "in.gst.gstr1.qrmp",
    form: "GSTR-1",
    title: "GSTR-1 outward supplies (quarterly, QRMP)",
    appliesTo: { kind: "gst", match: QRMP },
    periodType: "quarter",
    due: { type: "day_after_period", day: 13, monthsAfter: 1 },
    dueText: "13th of the month after the quarter",
    rollForward: false,
    source: {
      citation:
        "CGST Act 2017 s.37(1) proviso; CGST Rules r.59(1); Notification 83/2020-Central Tax",
      url: CBIC_NOTIFICATIONS,
    },
    verified: false,
    notes:
      "QRMP from Jan 2021. The optional monthly IFF (13th, first two months of the quarter) is not generated in v0.1.",
    effectiveFrom: "2021-01-01",
  },
  {
    key: "in.gst.gstr3b.monthly",
    form: "GSTR-3B",
    title: "GSTR-3B summary return (monthly)",
    appliesTo: { kind: "gst", match: MONTHLY },
    periodType: "month",
    due: { type: "day_after_period", day: 20, monthsAfter: 1 },
    dueText: "20th of the following month",
    rollForward: false,
    source: { citation: "CGST Act 2017 s.39(1); CGST Rules r.61(5)", url: CBIC_NOTIFICATIONS },
    verified: false,
    notes: "Verify. Tax is payable by the same date (s.39(7)); interest under s.50 runs after it.",
  },
  {
    key: "in.gst.gstr3b.qrmp.a",
    form: "GSTR-3B",
    title: "GSTR-3B summary return (quarterly, QRMP, state group A)",
    appliesTo: { kind: "gst", match: { ...QRMP, stateGroup: ["A"] } },
    periodType: "quarter",
    due: { type: "day_after_period", day: 22, monthsAfter: 1 },
    dueText: "22nd of the month after the quarter (state group A)",
    rollForward: false,
    source: {
      citation:
        "CGST Act 2017 s.39(1) proviso; CGST Rules r.61(5); Notification 76/2020-Central Tax (as amended)",
      url: CBIC_NOTIFICATIONS,
    },
    verified: false,
    notes:
      "Group A states and UTs are listed in stateGroups (verify the list). Monthly tax payment by PMT-06 on the 25th is not generated in v0.1.",
    effectiveFrom: "2021-01-01",
  },
  {
    key: "in.gst.gstr3b.qrmp.b",
    form: "GSTR-3B",
    title: "GSTR-3B summary return (quarterly, QRMP, state group B)",
    appliesTo: { kind: "gst", match: { ...QRMP, stateGroup: ["B"] } },
    periodType: "quarter",
    due: { type: "day_after_period", day: 24, monthsAfter: 1 },
    dueText: "24th of the month after the quarter (state group B)",
    rollForward: false,
    source: {
      citation:
        "CGST Act 2017 s.39(1) proviso; CGST Rules r.61(5); Notification 76/2020-Central Tax (as amended)",
      url: CBIC_NOTIFICATIONS,
    },
    verified: false,
    notes: "Group B states and UTs are listed in stateGroups (verify the list).",
    effectiveFrom: "2021-01-01",
  },
  {
    key: "in.gst.gstr9.annual",
    form: "GSTR-9",
    title: "GSTR-9 annual return",
    appliesTo: { kind: "gst", match: { scheme: [null, "regular", "qrmp"] } },
    periodType: "fy",
    due: { type: "fy_date", month: 12, day: 31, yearsAfterStart: 1 },
    dueText: "31 December after the end of the financial year",
    rollForward: false,
    source: { citation: "CGST Act 2017 s.44; CGST Rules r.80", url: CBIC_NOTIFICATIONS },
    verified: false,
    notes:
      "Optional below an aggregate turnover threshold (₹2 crore in recent years, by notification): verify each year. GSTR-9C applies above a higher threshold and is not generated.",
  },
];

/**
 * GST state code (first two digits of a GSTIN) → QRMP GSTR-3B state group.
 * Group A: 22nd; group B: 24th. VERIFY against Notification 76/2020-CT and
 * later amendments.
 */
export const gstStateGroups: Readonly<Record<string, string>> = {
  // Group A
  "22": "A", // Chhattisgarh
  "23": "A", // Madhya Pradesh
  "24": "A", // Gujarat
  "25": "A", // Daman and Diu (pre-merger code)
  "26": "A", // Dadra and Nagar Haveli and Daman and Diu
  "27": "A", // Maharashtra
  "29": "A", // Karnataka
  "30": "A", // Goa
  "31": "A", // Lakshadweep
  "32": "A", // Kerala
  "33": "A", // Tamil Nadu
  "34": "A", // Puducherry
  "35": "A", // Andaman and Nicobar Islands
  "36": "A", // Telangana
  "37": "A", // Andhra Pradesh
  // Group B
  "01": "B", // Jammu and Kashmir
  "02": "B", // Himachal Pradesh
  "03": "B", // Punjab
  "04": "B", // Chandigarh
  "05": "B", // Uttarakhand
  "06": "B", // Haryana
  "07": "B", // Delhi
  "08": "B", // Rajasthan
  "09": "B", // Uttar Pradesh
  "10": "B", // Bihar
  "11": "B", // Sikkim
  "12": "B", // Arunachal Pradesh
  "13": "B", // Nagaland
  "14": "B", // Manipur
  "15": "B", // Mizoram
  "16": "B", // Tripura
  "17": "B", // Meghalaya
  "18": "B", // Assam
  "19": "B", // West Bengal
  "20": "B", // Jharkhand
  "21": "B", // Odisha
  "38": "B", // Ladakh
};
