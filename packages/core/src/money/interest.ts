/**
 * Interest calculators. Pure: every date (including "today", as the end
 * date) is an input. Each result carries its workings so the UI can show the
 * formula, rate, period and inputs, and lets the user change the inputs.
 */
import type { IsoDate } from "@dueproof/contracts";
import { formatDate, formatMoney } from "@dueproof/i18n";
import {
  addDays,
  addMonths,
  compareIso,
  dayOfMonth,
  diffDays,
  isValidIsoDate,
  maxIso,
  minIso,
} from "../dates/calendar";
import { IN_MONEY_PACK } from "../statutory/packs/in/money";
import { parsePeriod } from "../statutory/periods";
import type { FyDate } from "../statutory/types";
import { bpText, divideRounded, roundMinor, toBig, toSafe } from "./arith";
import type {
  CalcResult,
  DailyInterestRule,
  InterestRule,
  MoneyPack,
  MonthlyInterestRule,
  Step,
} from "./types";

export interface MoneyOptions {
  /** Default: the India money pack. */
  pack?: MoneyPack;
  locale?: string;
  /** Default 4 (April). */
  fyStartMonth?: number;
}

export class MoneyInputError extends Error {
  override name = "MoneyInputError";
}

function getRule<K extends InterestRule["kind"]>(
  pack: MoneyPack,
  key: string,
  kind: K,
): Extract<InterestRule, { kind: K }> {
  const r = pack.interest.find((x) => x.key === key);
  if (!r) throw new MoneyInputError(`No interest rule "${key}" in ${pack.version}`);
  if (r.kind !== kind) throw new MoneyInputError(`${key} is ${r.kind}, not ${kind}`);
  return r as Extract<InterestRule, { kind: K }>;
}

function checkDate(d: IsoDate, what: string): void {
  if (!isValidIsoDate(d)) throw new MoneyInputError(`${what} is not a real date: ${d}`);
}

function checkAmount(minor: number, what: string): bigint {
  const v = toBig(minor, what);
  if (v < 0n) throw new MoneyInputError(`${what} cannot be negative`);
  return v;
}

function fmtTools(options: MoneyOptions) {
  const locale = options.locale ?? "en-IN";
  const currency = (options.pack ?? IN_MONEY_PACK).currency;
  return {
    money: (minor: bigint) => formatMoney(minor, { locale, currency }),
    date: (d: IsoDate) => formatDate(d, { locale }),
  };
}

function result(
  rule: InterestRule,
  amount: bigint,
  workings: Step[],
  warnings: string[] = [],
): CalcResult {
  const w = [...warnings];
  if (!rule.verified) w.push(`${rule.section}: rate and method not yet verified (verify in M0).`);
  return {
    amountMinor: toSafe(amount, "interest"),
    workings,
    estimate: true,
    ruleKey: rule.key,
    source: rule.source,
    verified: rule.verified,
    warnings: w,
  };
}

// ------------------------------------------------------------------ months

/**
 * How "months or part of a month" are counted (Income-tax Rules r.119A(a):
 * a fraction of a month is a full month). The two readings agree whenever
 * the period starts on the 1st, which is the usual case (234A from the day
 * after a month-end due date, 234B from 1 April). They differ when it starts
 * mid-month, e.g. after an extended due date:
 *
 * - `calendar`: each calendar month the period touches counts once. Due 16
 *   Sep, filed 5 Oct → September and October = 2. This is how the
 *   department's utilities are understood to count. VERIFY (CA sign-off).
 * - `elapsed`: whole months from the start date, then any part. A month
 *   from 17 Sep ends on 16 Oct, so 17 Sep → 5 Oct = 1. A month from the
 *   29th–31st ends on the last day of the next month when that month is
 *   shorter (29, 30 or 31 Jan → 28 Feb is one month).
 */
export type MonthCounting = "calendar" | "elapsed";

/** The last day of the `k`-th elapsed month from `start` (k ≥ 1). */
function elapsedMonthEnd(start: IsoDate, k: number): IsoDate {
  const next = addMonths(start, k);
  // Clamped: the start day does not exist k months on, so the month runs
  // to the end of that (shorter) month.
  return next.clamped ? next.date : addDays(next.date, -1);
}

/**
 * Months "or part of a month" from `start` (inclusive) to `end` (inclusive).
 * Zero when `end` is before `start`. See `MonthCounting`; default calendar.
 */
export function monthsOrPart(
  start: IsoDate,
  end: IsoDate,
  counting: MonthCounting = "calendar",
): number {
  if (compareIso(end, start) < 0) return 0;
  if (counting === "calendar") {
    const s = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7));
    const e = Number(end.slice(0, 4)) * 12 + Number(end.slice(5, 7));
    return e - s + 1;
  }
  let m = 1;
  while (compareIso(elapsedMonthEnd(start, m), end) < 0) m++;
  return m;
}

// --------------------------------------------------------------- GST (daily)

export interface DailyInterestInput {
  /** Default "in.gst.s50.1". */
  ruleKey?: string;
  /** The tax paid late (for s.50(1), the part paid in cash). */
  taxMinor: number;
  /** The due date. Interest runs from the next day. */
  dueOn: IsoDate;
  /** The date of payment, or the date to compute up to ("today", passed in). */
  paidOn: IsoDate;
}

/** Simple interest per day at an annual rate, split across rate changes (GST s.50). */
export function dailyInterest(input: DailyInterestInput, options: MoneyOptions = {}): CalcResult {
  const pack = options.pack ?? IN_MONEY_PACK;
  const rule: DailyInterestRule = getRule(pack, input.ruleKey ?? "in.gst.s50.1", "daily_simple");
  checkDate(input.dueOn, "Due date");
  checkDate(input.paidOn, "Payment date");
  const tax = checkAmount(input.taxMinor, "Tax");
  const f = fmtTools(options);
  const days = diffDays(input.dueOn, input.paidOn);
  const workings: Step[] = [
    {
      label: "Period of delay",
      formula: "days from the day after the due date to the date of payment",
      inputs: { "due date": f.date(input.dueOn), "paid on": f.date(input.paidOn) },
      result: `${Math.max(days, 0)} days`,
    },
  ];
  if (days <= 0) {
    workings.push({
      label: "Interest",
      formula: "paid on or before the due date",
      inputs: {},
      result: f.money(0n),
    });
    return result(rule, 0n, workings);
  }
  const first = addDays(input.dueOn, 1);
  const basis = BigInt(rule.dayCountBasis);
  const denominator = 10_000n * basis;
  let numerator = 0n;
  let covered = 0;
  for (const r of rule.rates) {
    const from = maxIso(first, r.from);
    const to = r.to ? minIso(input.paidOn, r.to) : input.paidOn;
    if (compareIso(from, to) > 0) continue;
    const n = diffDays(from, to) + 1;
    covered += n;
    const part = tax * BigInt(r.annualBp) * BigInt(n);
    numerator += part;
    workings.push({
      label: `Interest at ${bpText(r.annualBp)} a year`,
      formula: `tax × ${bpText(r.annualBp)} × days ÷ ${rule.dayCountBasis}`,
      inputs: {
        tax: f.money(tax),
        rate: `${bpText(r.annualBp)} a year`,
        days: String(n),
        from: f.date(from),
        to: f.date(to),
      },
      result: f.money(
        divideRounded(part, denominator, { toMinor: 1, mode: "nearest", citation: "" }),
      ),
    });
  }
  const warnings: string[] = [];
  if (covered < days)
    warnings.push(`No rate in the pack for ${days - covered} of the ${days} days.`);
  const amount = divideRounded(numerator, denominator, rule.resultRounding);
  workings.push({
    label: "Rounded",
    formula: rule.resultRounding.citation,
    inputs: {},
    result: f.money(amount),
  });
  return result(rule, amount, workings, warnings);
}

// ---------------------------------------------------------- income tax (monthly)

function monthly(
  rule: MonthlyInterestRule,
  amount: bigint,
  months: number,
  f: ReturnType<typeof fmtTools>,
  label: string,
  extra: Record<string, string> = {},
): { interest: bigint; steps: Step[] } {
  const principal = roundMinor(amount, rule.principalRounding);
  const steps: Step[] = [];
  if (principal !== amount) {
    steps.push({
      label: "Amount rounded",
      formula: rule.principalRounding.citation,
      inputs: { amount: f.money(amount) },
      result: f.money(principal),
    });
  }
  const interest = divideRounded(
    principal * BigInt(rule.monthlyBp) * BigInt(months),
    10_000n,
    rule.resultRounding,
  );
  steps.push({
    label,
    formula: `amount × ${bpText(rule.monthlyBp)} × months${rule.partMonthIsFull ? " (a part of a month counts as a month)" : ""}`,
    inputs: {
      amount: f.money(principal),
      rate: `${bpText(rule.monthlyBp)} a month`,
      months: String(months),
      ...extra,
    },
    result: f.money(interest),
  });
  return { interest, steps };
}

function fyStartYear(fy: string, options: MoneyOptions): number {
  const p = parsePeriod(fy, "fy", options.fyStartMonth ?? 4);
  if (!p) throw new MoneyInputError(`Not a financial year: ${fy} (expected e.g. "FY2025-26")`);
  return p.fyStart;
}

function fyDate(start: number, d: FyDate): IsoDate {
  return dayOfMonth(start + d.yearsAfterStart, d.month, d.day);
}

/** 234B/234C: below the s.208 minimum no advance tax is payable, so there is no interest. */
function noAdvanceTaxPayable(
  rule: MonthlyInterestRule,
  tax: bigint,
  what: string,
  f: ReturnType<typeof fmtTools>,
): Step[] | null {
  if (!rule.minimumTax || tax >= BigInt(rule.minimumTax.minor)) return null;
  const min = f.money(BigInt(rule.minimumTax.minor));
  return [
    {
      label: "Advance tax payable?",
      formula: `${what} below ${min}: no advance tax is payable (${rule.minimumTax.citation})`,
      inputs: { [what]: f.money(tax), minimum: min },
      result: "No",
    },
    {
      label: "Interest",
      formula: "no advance tax payable: no interest",
      inputs: {},
      result: f.money(0n),
    },
  ];
}

export interface Interest234AInput {
  /** Tax on returned/assessed income less advance tax, TDS/TCS and reliefs. */
  taxMinor: number;
  /** The return due date. */
  dueOn: IsoDate;
  /** Date the return was filed, or the date to compute up to. */
  filedOn: IsoDate;
}

/** s.234A: late return. */
export function interest234A(input: Interest234AInput, options: MoneyOptions = {}): CalcResult {
  const rule: MonthlyInterestRule = getRule(
    options.pack ?? IN_MONEY_PACK,
    "in.it.s234a",
    "monthly_simple",
  );
  checkDate(input.dueOn, "Due date");
  checkDate(input.filedOn, "Filing date");
  const tax = checkAmount(input.taxMinor, "Tax");
  const f = fmtTools(options);
  const start = addDays(input.dueOn, 1);
  const months = monthsOrPart(start, input.filedOn, rule.monthCounting);
  const workings: Step[] = [
    {
      label: "Period",
      formula: "months or part of a month from the day after the due date to the filing date",
      inputs: { "due date": f.date(input.dueOn), "filed on": f.date(input.filedOn) },
      result: `${months} months`,
    },
  ];
  if (months === 0 || tax === 0n) {
    workings.push({
      label: "Interest",
      formula: "filed on time, or no tax unpaid",
      inputs: {},
      result: f.money(0n),
    });
    return result(rule, 0n, workings);
  }
  const m = monthly(rule, tax, months, f, "Interest under s.234A");
  return result(rule, m.interest, [...workings, ...m.steps]);
}

export interface Interest234BInput {
  /** Assessed tax: tax on total income less TDS/TCS and reliefs. */
  assessedTaxMinor: number;
  advanceTaxPaidMinor: number;
  /** The financial year, e.g. "FY2025-26". */
  fy: string;
  /** Date of determination (filing/assessment), or the date to compute up to. */
  untilOn: IsoDate;
}

/** s.234B: advance tax short of the threshold. */
export function interest234B(input: Interest234BInput, options: MoneyOptions = {}): CalcResult {
  const rule: MonthlyInterestRule = getRule(
    options.pack ?? IN_MONEY_PACK,
    "in.it.s234b",
    "monthly_simple",
  );
  checkDate(input.untilOn, "End date");
  const assessed = checkAmount(input.assessedTaxMinor, "Assessed tax");
  const paid = checkAmount(input.advanceTaxPaidMinor, "Advance tax paid");
  const f = fmtTools(options);
  const start = fyStartYear(input.fy, options);
  const belowMinimum = noAdvanceTaxPayable(rule, assessed, "assessed tax", f);
  if (belowMinimum) return result(rule, 0n, belowMinimum);
  const threshold = BigInt(rule.thresholdBp ?? 10_000);
  const needed = divideRounded(assessed * threshold, 10_000n, {
    toMinor: 1,
    mode: "up",
    citation: "",
  });
  const workings: Step[] = [
    {
      label: "Threshold",
      formula: `advance tax paid compared with ${bpText(rule.thresholdBp ?? 10_000)} of assessed tax`,
      inputs: { "assessed tax": f.money(assessed), "advance tax paid": f.money(paid) },
      result: `${f.money(paid)} ${paid >= needed ? "≥" : "<"} ${f.money(needed)}`,
    },
  ];
  if (paid >= needed) {
    workings.push({
      label: "Interest",
      formula: "threshold met: no interest",
      inputs: {},
      result: f.money(0n),
    });
    return result(rule, 0n, workings);
  }
  const from = fyDate(start, rule.startsOn ?? { month: 4, day: 1, yearsAfterStart: 1 });
  const months = monthsOrPart(from, input.untilOn, rule.monthCounting);
  const shortfall = assessed - paid;
  workings.push(
    {
      label: "Shortfall",
      formula: "assessed tax − advance tax paid",
      inputs: { "assessed tax": f.money(assessed), "advance tax paid": f.money(paid) },
      result: f.money(shortfall),
    },
    {
      label: "Period",
      formula: "months or part of a month from 1 April of the assessment year to the end date",
      inputs: { from: f.date(from), to: f.date(input.untilOn) },
      result: `${months} months`,
    },
  );
  const m = monthly(rule, shortfall, months, f, "Interest under s.234B");
  return result(
    rule,
    m.interest,
    [...workings, ...m.steps],
    ["Self-assessment tax paid part-way through the period (s.234B(2)) is not modelled."],
  );
}

export interface Interest234CInput {
  /** Tax due on returned income less TDS/TCS and reliefs. */
  taxDueMinor: number;
  fy: string;
  /** "regular" (four instalments) or "presumptive" (s.44AD/44ADA, one instalment). */
  scheme?: string;
  /** Advance tax payments; a payment on an instalment's due date counts for it. */
  payments: { paidOn: IsoDate; amountMinor: number }[];
}

/** s.234C: instalments paid short or late. */
export function interest234C(input: Interest234CInput, options: MoneyOptions = {}): CalcResult {
  const rule: MonthlyInterestRule = getRule(
    options.pack ?? IN_MONEY_PACK,
    "in.it.s234c",
    "monthly_simple",
  );
  const scheme = input.scheme ?? "regular";
  const plan = rule.instalments?.[scheme];
  if (!plan) throw new MoneyInputError(`No instalment plan "${scheme}" for ${rule.key}`);
  const taxDue = checkAmount(input.taxDueMinor, "Tax due");
  const f = fmtTools(options);
  const start = fyStartYear(input.fy, options);
  for (const p of input.payments) {
    checkDate(p.paidOn, "Payment date");
    checkAmount(p.amountMinor, "Payment");
  }
  const belowMinimum = noAdvanceTaxPayable(rule, taxDue, "tax due", f);
  if (belowMinimum) return result(rule, 0n, belowMinimum);
  // Advance tax for a year is paid within that year: a payment dated before
  // it starts (or after it ends) is another year's, and is not counted.
  const fyStartMonth = options.fyStartMonth ?? 4;
  const yearStart = dayOfMonth(start, fyStartMonth, 1);
  const yearEnd = addDays(dayOfMonth(start + 1, fyStartMonth, 1), -1);
  const payments = input.payments.filter(
    (p) => compareIso(p.paidOn, yearStart) >= 0 && compareIso(p.paidOn, yearEnd) <= 0,
  );
  const warnings: string[] = [];
  const ignored = input.payments.length - payments.length;
  if (ignored > 0) {
    warnings.push(
      `${ignored} ${ignored === 1 ? "payment is" : "payments are"} dated outside ${input.fy} (${f.date(yearStart)} to ${f.date(yearEnd)}) and not counted.`,
    );
  }
  const workings: Step[] = [];
  let total = 0n;
  for (const [i, inst] of plan.entries()) {
    const dueOn = fyDate(start, inst.due);
    const paidBy = payments
      .filter((p) => compareIso(p.paidOn, dueOn) <= 0)
      .reduce((a, p) => a + BigInt(p.amountMinor), 0n);
    const required = divideRounded(taxDue * BigInt(inst.cumulativeBp), 10_000n, {
      toMinor: 1,
      mode: "nearest",
      citation: "",
    });
    const label = `Instalment ${i + 1} (${f.date(dueOn)})`;
    const inputs = {
      "tax due": f.money(taxDue),
      required: `${bpText(inst.cumulativeBp)} = ${f.money(required)}`,
      "paid by then": f.money(paidBy),
    };
    if (
      inst.safeHarbourBp !== undefined &&
      paidBy * 10_000n >= taxDue * BigInt(inst.safeHarbourBp)
    ) {
      workings.push({
        label,
        formula: `paid at least ${bpText(inst.safeHarbourBp)} of tax due: no interest`,
        inputs,
        result: f.money(0n),
      });
      continue;
    }
    const shortfall = required > paidBy ? required - paidBy : 0n;
    if (shortfall === 0n) {
      workings.push({ label, formula: "no shortfall", inputs, result: f.money(0n) });
      continue;
    }
    const m = monthly(rule, shortfall, inst.months, f, label, { shortfall: f.money(shortfall) });
    total += m.interest;
    workings.push(...m.steps);
  }
  workings.push({
    label: "Total under s.234C",
    formula: "sum of the instalments",
    inputs: {},
    result: f.money(total),
  });
  return result(rule, total, workings, warnings);
}
