/**
 * Penalty as a range, never one figure (01 §4): the lowest and highest the
 * cited section allows, from data, with the working shown.
 */
import { formatMoney } from "@dueproof/i18n";
import { IN_MONEY_PACK } from "../statutory/packs/in/money";
import { bpText, divideRounded, toBig, toSafe } from "./arith";
import { MoneyInputError, type MoneyOptions } from "./interest";
import type { PenaltyBound, PenaltyRange, Rounding, Step } from "./types";

function evaluate(bound: PenaltyBound, base: bigint, rounding: Rounding): bigint {
  switch (bound.type) {
    case "zero":
      return 0n;
    case "fixed":
      return toBig(bound.minor, "fixed penalty");
    case "pct":
      return divideRounded(base * BigInt(bound.bp), 10_000n, rounding);
    case "max":
      return bound.of.map((b) => evaluate(b, base, rounding)).reduce(bigMax);
    case "min":
      return bound.of.map((b) => evaluate(b, base, rounding)).reduce(bigMin);
  }
}

// Math.max/min do not take bigints.
const bigMax = (a: bigint, b: bigint): bigint => (b > a ? b : a);
const bigMin = (a: bigint, b: bigint): bigint => (b < a ? b : a);

/** Plain words for a bound: "the higher of 10 % of tax and ₹10,000". */
export function describeBound(
  bound: PenaltyBound,
  baseLabel: string,
  money: (m: bigint) => string,
): string {
  switch (bound.type) {
    case "zero":
      return "nil";
    case "fixed":
      return money(BigInt(bound.minor));
    case "pct":
      return `${bpText(bound.bp)} of ${baseLabel}`;
    case "max":
    case "min": {
      const parts = bound.of.map((b) => describeBound(b, baseLabel, money));
      const head = parts.slice(0, -1).join(", ");
      return `the ${bound.type === "max" ? "higher" : "lower"} of ${head} and ${parts.at(-1)}`;
    }
  }
}

export function penaltyRange(
  key: string,
  baseMinor: number,
  options: MoneyOptions = {},
): PenaltyRange {
  const pack = options.pack ?? IN_MONEY_PACK;
  const rule = pack.penalties.find((p) => p.key === key);
  if (!rule) throw new MoneyInputError(`No penalty rule "${key}" in ${pack.version}`);
  const base = toBig(baseMinor, "Base amount");
  if (base < 0n) throw new MoneyInputError("Base amount cannot be negative");
  const money = (m: bigint) =>
    formatMoney(m, { locale: options.locale ?? "en-IN", currency: pack.currency });
  let low = evaluate(rule.low, base, pack.penaltyRounding);
  let high = evaluate(rule.high, base, pack.penaltyRounding);
  if (low > high) [low, high] = [high, low];
  const workings: Step[] = [
    {
      label: "Lowest",
      formula: describeBound(rule.low, rule.baseLabel, money),
      inputs: { [rule.baseLabel]: money(base), when: rule.lowWhen },
      result: money(low),
    },
    {
      label: "Highest",
      formula: describeBound(rule.high, rule.baseLabel, money),
      inputs: { [rule.baseLabel]: money(base), when: rule.highWhen },
      result: money(high),
    },
  ];
  return {
    lowMinor: toSafe(low, "penalty"),
    highMinor: toSafe(high, "penalty"),
    workings,
    estimate: true,
    ruleKey: rule.key,
    source: rule.source,
    verified: rule.verified,
  };
}
