/**
 * The date engine: the only code that turns a DateRule into a date (AGENTS
 * rule 2). Pure: the anchors, holidays, working days and "today" all come in
 * through the context.
 *
 * Conventions (every one marked VERIFY until a CA signs off):
 * - "N days from X": the day of X is excluded, so the last day is X + N
 *   (General Clauses Act 1897 s.9). 30 days from receipt on 24 Oct → 23 Nov.
 * - "N working days from X": count working days after X; the N-th is the last day.
 * - "N months from X": the same day N months later; if that month has no
 *   such day, its last day (31 Jan + 1 month → 28/29 Feb). Recorded in
 *   adjustments.
 * - Condonation: the extra window runs from the normal last day (before any
 *   roll-forward) and is returned as `windowEndOn`, never merged into dueOn.
 * - Non-working days: a relative date is moved to the next working day only
 *   when `ctx.rollForward` is set; otherwise a warning is recorded. A fixed
 *   date stated on a document is never moved.
 */
import type { Anchor, DateRule, IsoDate } from "@dueproof/contracts";
import { formatDate } from "@dueproof/i18n";
import { resolveStatutory } from "../statutory/resolve";
import {
  addDays,
  addMonths,
  addWorkingDays,
  isValidIsoDate,
  type WorkingCalendar,
} from "./calendar";
import { applyNonWorkingPolicy } from "./nonworking";
import type { DateContext, DateError, ResolvedDateDetail } from "./types";

const ANCHOR_WORDS: Record<Exclude<Anchor, "fixed">, string> = {
  receipt: "receipt",
  issue: "issue",
  order: "the order",
  service: "service",
  hearing: "the hearing",
};

const ANCHOR_ASK: Record<Exclude<Anchor, "fixed">, string> = {
  receipt: "Needs the date the notice was received",
  issue: "Needs the date of issue",
  order: "Needs the date of the order",
  service: "Needs the date the order was served or communicated",
  hearing: "Needs the hearing date",
};

function unitWords(amount: number, unit: "days" | "working_days" | "months"): string {
  const one = amount === 1;
  if (unit === "days") return one ? "day" : "days";
  if (unit === "working_days") return one ? "working day" : "working days";
  return one ? "month" : "months";
}

function err(error: DateError["error"], message: string, anchor?: Anchor): DateError {
  return anchor ? { error, message, anchor } : { error, message };
}

export function resolveDate(rule: DateRule, ctx: DateContext): ResolvedDateDetail | DateError {
  const locale = ctx.locale ?? "en-IN";
  const cal: WorkingCalendar = { workingDays: ctx.workingDays, holidays: ctx.holidays };
  const fmt = (d: IsoDate) => formatDate(d, { locale });
  const adjustments: string[] = [];
  const warnings: string[] = [];

  switch (rule.type) {
    case "fixed": {
      if (!isValidIsoDate(rule.date)) return err("invalid_date", `Not a real date: ${rule.date}`);
      // A date stated on the document is never moved.
      applyNonWorkingPolicy(
        rule.date,
        cal,
        false,
        locale,
        adjustments,
        warnings,
        "The stated date",
      );
      return {
        dueOn: rule.date,
        rule,
        basis: `On ${fmt(rule.date)}, as stated`,
        adjustments,
        warnings,
        inputs: { date: rule.date },
      };
    }

    case "relative": {
      const anchorDate = ctx.anchors[rule.anchor];
      if (!anchorDate) return err("missing_anchor", ANCHOR_ASK[rule.anchor], rule.anchor);
      if (!isValidIsoDate(anchorDate)) {
        return err(
          "invalid_date",
          `The ${rule.anchor} date is not a real date: ${anchorDate}`,
          rule.anchor,
        );
      }
      if (!Number.isInteger(rule.amount) || rule.amount <= 0) {
        return err(
          "invalid_rule",
          `The period must be a whole number above zero, got ${rule.amount}`,
        );
      }
      let last: IsoDate;
      if (rule.unit === "days") {
        last = addDays(anchorDate, rule.amount);
      } else if (rule.unit === "working_days") {
        if (cal.workingDays.length === 0) {
          return err(
            "no_working_days",
            "No working days are set, so working days cannot be counted",
          );
        }
        last = addWorkingDays(anchorDate, rule.amount, cal);
      } else if (rule.unit === "months") {
        const r = addMonths(anchorDate, rule.amount);
        last = r.date;
        if (r.clamped) {
          adjustments.push(
            `No matching day in that month: ${rule.amount} ${unitWords(rule.amount, "months")} from ${fmt(anchorDate)} ends on the month's last day, ${fmt(last)}.`,
          );
        }
      } else {
        return err("invalid_rule", `Unknown unit: ${String(rule.unit)}`);
      }
      const roll = ctx.rollForward ?? false;
      const dueOn = applyNonWorkingPolicy(last, cal, roll, locale, adjustments, warnings);
      const basis = `${rule.amount} ${unitWords(rule.amount, rule.unit)} from ${ANCHOR_WORDS[rule.anchor]} on ${fmt(anchorDate)}`;
      const inputs: ResolvedDateDetail["inputs"] = {
        anchor: rule.anchor,
        anchorDate,
        amount: rule.amount,
        unit: rule.unit,
        rollForward: roll,
      };
      const out: ResolvedDateDetail = { dueOn, rule, basis, adjustments, warnings, inputs };
      if (dueOn !== last) out.originalDueOn = last;

      if (rule.condonable) {
        const c = rule.condonable;
        if (!Number.isInteger(c.amount) || c.amount <= 0) {
          return err(
            "invalid_rule",
            `The condonable period must be a whole number above zero, got ${c.amount}`,
          );
        }
        let windowEnd: IsoDate;
        if (c.unit === "days") {
          windowEnd = addDays(last, c.amount);
        } else if (c.unit === "months") {
          const r = addMonths(last, c.amount);
          windowEnd = r.date;
          if (r.clamped) {
            adjustments.push(`Condonation window ends on the month's last day, ${fmt(windowEnd)}.`);
          }
        } else {
          return err("invalid_rule", `Unknown condonable unit: ${String(c.unit)}`);
        }
        windowEnd = applyNonWorkingPolicy(
          windowEnd,
          cal,
          roll,
          locale,
          adjustments,
          warnings,
          "The condonation window's end",
        );
        out.windowEndOn = windowEnd;
        out.windowBasis = `A further ${c.amount} ${unitWords(c.amount, c.unit)} may be allowed (condonation), to ${fmt(windowEnd)}`;
        inputs.condonableAmount = c.amount;
        inputs.condonableUnit = c.unit;
      }
      return out;
    }

    case "statutory": {
      const st = ctx.statutory ?? {};
      return resolveStatutory(rule.ruleKey, rule.period, {
        ...(st.pack ? { pack: st.pack } : {}),
        extensions: ctx.extensions ?? [],
        calendar: cal,
        ...(st.events ? { events: st.events } : {}),
        ...(st.facts ? { facts: st.facts } : {}),
        locale,
      });
    }
  }
}
