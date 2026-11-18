/**
 * Deadlines from orders: appeal windows as data (per country pack), resolved
 * by the date engine. The normal last date and the condonation limit are two
 * separate dates (01 §4).
 */
import type { Anchor, DateRule } from "@dueproof/contracts";
import { formatDate } from "@dueproof/i18n";
import { compareIso, isValidIsoDate, lastDayOfMonth, parseIso } from "../dates/calendar";
import { resolveDate } from "../dates/engine";
import {
  type DateContext,
  type DateError,
  isDateError,
  type ResolvedDateDetail,
} from "../dates/types";
import type { StatutorySource } from "./types";

export interface OrderWindowRule {
  key: string;
  title: string;
  /** What the window runs from; usually when the order was served/communicated. */
  anchor: Exclude<Anchor, "fixed">;
  amount: number;
  unit: "days" | "working_days" | "months";
  /** A fixed extra period the authority may allow. Absent when there is no fixed outer limit. */
  condonable?: { amount: number; unit: "days" | "months" };
  /**
   * Count from the last day of the anchor's month ("two months from the end
   * of the month in which the order is communicated"), for anchors on or
   * after `since`. The stored DateRule cannot say this, so the shifted
   * anchor is recorded in `inputs`.
   */
  fromEndOfMonth?: { since: string };
  source: StatutorySource;
  verified: boolean;
  notes: string;
}

export interface OrderWindowResult extends ResolvedDateDetail {
  windowRule: OrderWindowRule;
}

/** The DateRule an order window produces (stored on the deadline row). */
export function orderWindowRule(w: OrderWindowRule): DateRule {
  return {
    type: "relative",
    anchor: w.anchor,
    amount: w.amount,
    unit: w.unit,
    ...(w.condonable ? { condonable: w.condonable } : {}),
  };
}

/**
 * Resolve an appeal window. If the trigger date (e.g. service of the order)
 * is not known, returns `missing_anchor`: the UI shows "needs communication
 * date" until a person answers (03 §8a).
 */
export function resolveOrderWindow(
  windows: readonly OrderWindowRule[],
  key: string,
  ctx: DateContext,
): OrderWindowResult | DateError {
  const w = windows.find((x) => x.key === key);
  if (!w) return { error: "unknown_rule", message: `No order window "${key}"` };
  const anchorOn = ctx.anchors[w.anchor];
  let monthEnd: string | undefined;
  if (
    w.fromEndOfMonth &&
    anchorOn &&
    isValidIsoDate(anchorOn) &&
    compareIso(anchorOn, w.fromEndOfMonth.since) >= 0
  ) {
    const { year, month } = parseIso(anchorOn);
    monthEnd = lastDayOfMonth(year, month);
  }
  const r = resolveDate(
    orderWindowRule(w),
    monthEnd ? { ...ctx, anchors: { ...ctx.anchors, [w.anchor]: monthEnd } } : ctx,
  );
  if (isDateError(r)) return r;
  const warnings = [...r.warnings];
  if (!w.condonable)
    warnings.push("No fixed condonation limit: a late appeal needs a condonation application.");
  if (!w.verified)
    warnings.push("Period not yet checked against the statute by a chartered accountant.");
  if (monthEnd && anchorOn) {
    const fmt = (d: string) => formatDate(d, { locale: ctx.locale ?? "en-IN" });
    return {
      ...r,
      basis: `${w.title}: ${w.amount} ${w.unit} from the end of the month of ${w.anchor} on ${fmt(anchorOn)} (${fmt(monthEnd)})`,
      inputs: { ...r.inputs, [`${w.anchor}On`]: anchorOn, countedFrom: monthEnd },
      warnings,
      windowRule: w,
    };
  }
  return { ...r, basis: `${w.title}: ${r.basis}`, warnings, windowRule: w };
}
