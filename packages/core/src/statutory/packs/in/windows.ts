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
    source: {
      citation: "Income-tax Act 1961 s.253(3), s.253(5)",
      url: "https://incometaxindia.gov.in/",
    },
    verified: false,
    notes:
      "Two months from the date the order is communicated. The Tribunal may admit a late appeal for sufficient cause; no fixed outer limit.",
  },
];
