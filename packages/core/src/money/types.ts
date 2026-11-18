/**
 * Interest, penalty and exposure types. Money is integer minor units (paise)
 * everywhere; arithmetic is done in bigint and returned as safe integers.
 * Rates and rounding rules are DATA in the country pack, each with a source
 * and `verified: false` until a CA signs off (03 §8a).
 */
import type { IsoDate } from "@dueproof/contracts";
import type { FyDate, StatutorySource } from "../statutory/types";

/** One line of working the UI shows: what was done, with which inputs, giving what. */
export interface Step {
  label: string;
  formula: string;
  inputs: Record<string, string>;
  result: string;
}

export interface Rounding {
  /** Round to a multiple of this many minor units: 100 = nearest rupee, 10000 = ₹100. */
  toMinor: number;
  mode: "down" | "nearest" | "up";
  /** Where the rounding rule comes from. */
  citation: string;
}

export interface CalcResult {
  amountMinor: number;
  workings: Step[];
  /** Always true: "an estimate from the stated inputs, not advice" (01 §4). */
  estimate: true;
  ruleKey: string;
  source: StatutorySource;
  verified: boolean;
  warnings: string[];
}

interface InterestRuleBase {
  key: string;
  /** e.g. "CGST Act s.50(1)" */
  section: string;
  title: string;
  source: StatutorySource;
  verified: boolean;
  notes: string;
}

/** Simple interest per day at an annual rate (GST s.50). */
export interface DailyInterestRule extends InterestRuleBase {
  kind: "daily_simple";
  /** Rate by effective-date range, in basis points per year (1800 = 18 %). */
  rates: { from: IsoDate; to?: IsoDate; annualBp: number }[];
  dayCountBasis: number;
  resultRounding: Rounding;
}

/** Simple interest per month or part of a month (income-tax 234A/B/C). */
export interface MonthlyInterestRule extends InterestRuleBase {
  kind: "monthly_simple";
  /** Basis points per month (100 = 1 %). */
  monthlyBp: number;
  /** Rule 119A: the amount is rounded down to a multiple of ₹100 before interest. */
  principalRounding: Rounding;
  resultRounding: Rounding;
  /** Rule 119A(a): a part of a month counts as a whole month. */
  partMonthIsFull: boolean;
  /** How months are counted when a period starts mid-month (see `MonthCounting`). Default "calendar". */
  monthCounting?: "calendar" | "elapsed";
  /**
   * 234B/234C: no interest unless the tax is at least this much, because
   * advance tax is payable only from this amount (s.208).
   */
  minimumTax?: { minor: number; citation: string };
  /** 234B: interest applies only if advance tax paid is below this share of assessed tax. */
  thresholdBp?: number;
  /** 234B: when the interest period starts (1 April of the assessment year). */
  startsOn?: FyDate;
  /** 234C: instalments, per scheme. */
  instalments?: Record<
    string,
    { due: FyDate; cumulativeBp: number; safeHarbourBp?: number; months: number }[]
  >;
}

export type InterestRule = DailyInterestRule | MonthlyInterestRule;

/** A penalty bound: a share of the base, a fixed sum, or the higher/lower of several. */
export type PenaltyBound =
  | { type: "zero" }
  | { type: "pct"; bp: number }
  | { type: "fixed"; minor: number }
  | { type: "max"; of: PenaltyBound[] }
  | { type: "min"; of: PenaltyBound[] };

export interface PenaltyRule {
  key: string;
  section: string;
  title: string;
  /** What the percentage applies to, e.g. "tax", "tax on under-reported income". */
  baseLabel: string;
  low: PenaltyBound;
  high: PenaltyBound;
  /** When the low end applies, in plain words. */
  lowWhen: string;
  highWhen: string;
  source: StatutorySource;
  verified: boolean;
  notes: string;
}

export interface PenaltyRange {
  lowMinor: number;
  highMinor: number;
  workings: Step[];
  estimate: true;
  ruleKey: string;
  source: StatutorySource;
  verified: boolean;
}

export interface MoneyPack {
  country: string;
  version: string;
  asOf: IsoDate;
  currency: string;
  /** How a percentage penalty is rounded. */
  penaltyRounding: Rounding;
  interest: readonly InterestRule[];
  penalties: readonly PenaltyRule[];
}
