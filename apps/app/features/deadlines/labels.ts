import type { DeadlineSource } from "@/lib/deadline-rows";

export const SOURCE_LABEL: Record<DeadlineSource, string> = {
  notice: "Notice",
  order: "Order",
  statutory: "Statutory",
  manual: "Added by hand",
};

export const TYPE_LABEL = {
  gst: "GST",
  income_tax: "Income tax",
  tds: "TDS",
  roc: "ROC",
  other: "Other",
} as const;
