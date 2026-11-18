/**
 * India — appeal windows that run from an order (01 §4 "Deadlines from
 * orders"). DATA ONLY. Every period is marked `verified: false`: VERIFY
 * AGAINST THE STATUTE IN M0.
 */
import type { OrderWindowRule } from "../../windows";

export const orderWindows: readonly OrderWindowRule[] = [
  {
    key: "in.gst.appeal.s107",
    title: "Appeal to the GST Appellate Authority",
    anchor: "service",
    amount: 3,
    unit: "months",
    condonable: { amount: 1, unit: "months" },
    source: { citation: "CGST Act 2017 s.107(1), s.107(4)", url: "https://cbic-gst.gov.in/" },
    verified: false,
    notes:
      "Three months from communication of the order; the authority may allow a further one month for sufficient cause. Pre-deposit under s.107(6) applies.",
  },
  {
    key: "in.gst.appeal.s112",
    title: "Appeal to the GST Appellate Tribunal",
    anchor: "service",
    amount: 3,
    unit: "months",
    condonable: { amount: 3, unit: "months" },
    source: { citation: "CGST Act 2017 s.112(1), s.112(6)", url: "https://cbic-gst.gov.in/" },
    verified: false,
    notes:
      "Three months from communication of the order (or a later date notified while the Tribunal was being set up: verify); the Tribunal may condone a further three months.",
  },
  {
    key: "in.it.appeal.cita",
    title: "Appeal to the Commissioner (Appeals)",
    anchor: "service",
    amount: 30,
    unit: "days",
    source: {
      citation: "Income-tax Act 1961 s.249(2), s.249(3)",
      url: "https://incometaxindia.gov.in/",
    },
    verified: false,
    notes:
      "30 days from service of the notice of demand (or of the order, for some appeals). Delay may be condoned for sufficient cause with no fixed outer limit, so no condonation date is shown.",
  },
  {
    key: "in.it.appeal.itat",
    title: "Appeal to the Income Tax Appellate Tribunal",
    anchor: "service",
    amount: 2,
    unit: "months",
    fromEndOfMonth: { since: "2024-10-01" },
    source: {
      citation:
        "Income-tax Act 1961 s.253(3) as amended by the Finance (No. 2) Act 2024 (from 1 Oct 2024), s.253(5)",
      url: "https://incometaxindia.gov.in/",
    },
    verified: false,
    notes:
      "Two months from the end of the month in which the order is communicated, for orders communicated on or after 1 October 2024 (before then, two months from the date of communication). Verify whether the start date turns on the order's date or its communication. The Tribunal may admit a late appeal for sufficient cause; no fixed outer limit.",
  },
];

/** Which appeal window an order starts, or why none is added automatically. */
export type OrderWindowChoice = { key: string } | { key: null; review: string };

/** An order of an appellate authority, tribunal or court: the next appeal is a different one. */
const APPELLATE =
  /\b(appellate|appeals?|tribunal|gstat|itat|apl[-\s]?0?[1-5]|order[-\s]in[-\s]appeal|high court|supreme court|nclt|nclat|court)\b|\bcit\s*\(\s*a\s*\)/i;
const GST = /\b(gst|gstin|cgst|sgst|igst|utgst|goods and services tax)\b|\bin\.gst\./i;
const INCOME_TAX =
  /\b(income[-\s]tax|tds|tcs|assessing officer|assessment year|section\s+(139|142|143|144|144b|147|148|148a|154|156|200a|201|206c|270a|271|271aac))\b|\bin\.(it|tds)\./i;

/**
 * Pick the appeal window for an order from the case's notice type and the
 * order's document type. Conservative (01 §4): an automatic window only when
 * the text clearly says which law the order is under and nothing suggests it
 * was passed on appeal. Otherwise no window, and a reason to check by hand.
 *
 * - GST, not appellate → s.107 (an order of an adjudicating authority).
 * - Income tax or TDS, not appellate → CIT(A) (s.246A / s.249).
 * - Anything appellate (Appellate Authority, Tribunal, court): s.112, s.253
 *   or a court's own rules apply, which depend on who passed the order. Not
 *   guessed.
 */
export function inOrderWindowFor(
  noticeType: string | null,
  docType: string | null,
): OrderWindowChoice {
  const t = `${noticeType ?? ""} ${docType ?? ""}`;
  const gst = GST.test(t);
  const it = INCOME_TAX.test(t);
  if (APPELLATE.test(t)) {
    return {
      key: null,
      review:
        "This looks like an order passed on appeal or by a tribunal or court. The next appeal and its time limit depend on who passed it: check and add the date by hand.",
    };
  }
  if (gst && it) {
    return {
      key: null,
      review:
        "The case mentions both GST and income tax, so the appeal route is not clear: check and add the date by hand.",
    };
  }
  if (gst) return { key: "in.gst.appeal.s107" };
  if (it) return { key: "in.it.appeal.cita" };
  return {
    key: null,
    review: "No appeal window is known for this kind of order: check it by hand.",
  };
}
