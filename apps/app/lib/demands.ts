/**
 * Demand and interest on a case (01 §4 "Exposure"). Amounts as stated are
 * inputs; interest and the penalty range are computed by core from the
 * money pack, with their workings, and always labelled an estimate. The
 * inputs are stored so the workings can be shown and recomputed.
 */
import {
  type CalcResult,
  dailyInterest,
  IN_MONEY_PACK,
  interest234A,
  type PenaltyRange,
  penaltyRange,
} from "@dueproof/core";
import { z } from "zod";

export const INTEREST_RULES = [
  { key: "in.gst.s50.1", label: "GST s.50(1): tax paid late", taxType: "gst" },
  { key: "in.gst.s50.3", label: "GST s.50(3): input tax credit wrongly used", taxType: "gst" },
  { key: "in.it.s234a", label: "Income tax s.234A: late return", taxType: "income_tax" },
] as const;

export const PENALTY_RULES = IN_MONEY_PACK.penalties.map((p) => ({
  key: p.key,
  label: `${p.section}: ${p.title}`,
}));

export const DemandInputs = z.object({
  /** Interest runs from the day after this date. */
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date the tax was due."),
  /** Interest is computed up to this date (payment, or today). */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface DemandComputation {
  interest: CalcResult | null;
  penalty: PenaltyRange | null;
  error: string | null;
}

export function computeDemand(
  principalMinor: number,
  interestRule: string | null,
  penaltyRule: string | null,
  inputs: { dueOn?: string; asOf?: string } | null,
  locale = "en-IN",
): DemandComputation {
  let interest: CalcResult | null = null;
  let penalty: PenaltyRange | null = null;
  let error: string | null = null;
  try {
    if (interestRule && inputs?.dueOn && inputs.asOf) {
      interest =
        interestRule === "in.it.s234a"
          ? interest234A(
              { taxMinor: principalMinor, dueOn: inputs.dueOn, filedOn: inputs.asOf },
              { locale },
            )
          : dailyInterest(
              {
                ruleKey: interestRule,
                taxMinor: principalMinor,
                dueOn: inputs.dueOn,
                paidOn: inputs.asOf,
              },
              { locale },
            );
    }
    if (penaltyRule) penalty = penaltyRange(penaltyRule, principalMinor, { locale });
  } catch (e) {
    error = e instanceof Error ? e.message : "The figures couldn't be computed.";
  }
  return { interest, penalty, error };
}
