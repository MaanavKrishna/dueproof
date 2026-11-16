// The sample notice used on the home page. It is fictional: the office,
// reference, company and GSTIN are made up. The due date is what the date
// engine computes from the rule in the outlined sentence and the receipt date.

export const NOTICE = {
  office: ["Office of the Assistant Commissioner of State Tax", "Commercial Taxes Department, Northline Division"],
  reference: "ZD2910260012345",
  dated: "20 Oct 2026",
  to: "Harbour Valley Components Pvt Ltd · GSTIN 29AAHCH4417M1ZQ",
  subject: "Notice under Section 61 for intimating discrepancies in the return (Form GST ASMT-10)",
  opening:
    "On scrutiny of the returns filed for the period April 2025 to March 2026, discrepancies were noticed in the input tax credit claimed against the supplier statements.",
  proof:
    "You are hereby directed to explain the discrepancies and pay the tax of Rs. 4,52,300 with interest within 30 days of receipt of this notice.",
  hearing: "A personal hearing is fixed on 18 November 2026 at 11:00 AM before the undersigned at the Division office.",
} as const;

export const COMPUTED = {
  received: "24 Oct 2026",
  due: "23 Nov 2026",
  rule: "30 days from receipt",
  amount: "₹4,52,300",
  amountWords: "₹4.52 lakh",
  hearing: "18 Nov 2026, 11:00",
} as const;
