/**
 * A DateRule is what the engine or a model *extracts*; the TypeScript date
 * engine (packages/core) is the only thing that turns it into a date.
 * Models never produce dates directly (04 §1).
 */
import { z } from "zod";
import { IsoDate } from "./domain";

/** What a relative period is counted from. */
export const Anchor = z.enum([
  "receipt", // the day the notice reached the firm (editable, with history)
  "issue", // the date printed on the notice
  "order", // the date of the order
  "service", // the date the order was served/communicated
  "hearing", // a hearing date
  "fixed", // no anchor: an explicit date
]);
export type Anchor = z.infer<typeof Anchor>;

export const DateRule = z.discriminatedUnion("type", [
  /** "on 18 November 2026" */
  z.object({ type: z.literal("fixed"), date: IsoDate }),
  /** "within 30 days of receipt", "within 3 months from the date of communication" */
  z.object({
    type: z.literal("relative"),
    anchor: Anchor.exclude(["fixed"]),
    amount: z.number().int().positive(),
    unit: z.enum(["days", "working_days", "months"]),
    /** Extra window an authority may allow (condonation), shown as a separate date. */
    condonable: z
      .object({ amount: z.number().int().positive(), unit: z.enum(["days", "months"]) })
      .optional(),
  }),
  /** Recurring statutory due date, resolved by the statutory calendar. */
  z.object({
    type: z.literal("statutory"),
    ruleKey: z.string(), // e.g. "in.gst.gstr3b.monthly"
    period: z.string(), // e.g. "2026-10" or "FY2025-26" or "2026-Q3"
  }),
]);
export type DateRule = z.infer<typeof DateRule>;

/** A resolved due date, always with the rule and basis that produced it. */
export const ResolvedDate = z.object({
  dueOn: IsoDate,
  /** End of the condonation window, if any. Never merged into dueOn. */
  windowEndOn: IsoDate.optional(),
  rule: DateRule,
  /** Plain words for the UI: "30 days from receipt on 24 Oct 2026". */
  basis: z.string(),
  /** Holidays/extensions that moved the date, for transparency. */
  adjustments: z.array(z.string()).default([]),
});
export type ResolvedDate = z.infer<typeof ResolvedDate>;
