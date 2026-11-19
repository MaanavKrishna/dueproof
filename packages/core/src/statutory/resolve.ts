/**
 * Resolve one statutory rule for one period: base date from the pack's due
 * rule, then any extension (a dated override), then the rule's
 * non-working-day policy.
 */
import type { IsoDate } from "@dueproof/contracts";
import { formatDate } from "@dueproof/i18n";
import {
  addDays,
  compareIso,
  dayOfMonth,
  isValidIsoDate,
  type WorkingCalendar,
} from "../dates/calendar";
import { applyNonWorkingPolicy } from "../dates/nonworking";
import type { DateError, DateErrorCode, ResolvedDateDetail } from "../dates/types";
import { factsMatch } from "./match";
import { IN_PACK } from "./packs/in";
import { parsePeriod } from "./periods";
import type {
  Extension,
  FyDate,
  MatchValue,
  ParsedPeriod,
  StatutoryPack,
  StatutoryRule,
} from "./types";

export interface StatutoryResolveOptions {
  /** Default: the India pack. */
  pack?: StatutoryPack;
  extensions?: readonly Extension[];
  /** For non-working-day checks. Default: Mon–Sat, no holidays. */
  calendar?: WorkingCalendar;
  /** Event dates for this period, e.g. { agm: "2026-09-25" }. */
  events?: Record<string, IsoDate>;
  /** Registration facts: scoped extensions apply only when these match. */
  facts?: Record<string, MatchValue>;
  locale?: string;
}

const DEFAULT_CAL: WorkingCalendar = { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] };

function fyDate(p: ParsedPeriod, d: FyDate): IsoDate {
  return dayOfMonth(p.fyStart + d.yearsAfterStart, d.month, d.day);
}

/** The base due date before extensions and roll-forward. */
export function baseDueDate(
  rule: StatutoryRule,
  period: ParsedPeriod,
  events: Record<string, IsoDate> = {},
):
  | { dueOn: IsoDate; text: string; warnings: string[] }
  | { error: DateErrorCode; message: string } {
  const due = rule.due;
  switch (due.type) {
    case "day_after_period": {
      const endYear = Number(period.end.slice(0, 4));
      const endMonth = Number(period.end.slice(5, 7));
      const o = due.overrides?.find((x) => x.periodEndMonth === endMonth);
      const day = o?.day ?? due.day;
      const after = o?.monthsAfter ?? due.monthsAfter;
      return {
        dueOn: dayOfMonth(endYear, endMonth + after, day),
        text: o?.text ?? rule.dueText,
        warnings: [],
      };
    }
    case "fy_date":
      return { dueOn: fyDate(period, due), text: rule.dueText, warnings: [] };
    case "instalments": {
      const i = (period.index ?? 0) - 1;
      const d = due.dates[i];
      if (!d) {
        return {
          error: "bad_period",
          message: `${rule.form} has ${due.dates.length} instalments; there is no instalment ${i + 1}`,
        };
      }
      return { dueOn: fyDate(period, d), text: d.text, warnings: [] };
    }
    case "days_after_event": {
      const at = events[due.event];
      const lastDay = fyDate(period, due.fallback);
      const name = due.event.toUpperCase();
      const fallbackText = `${rule.dueText}; ${due.fallback.text.charAt(0).toLowerCase()}${due.fallback.text.slice(1)}`;
      if (at) {
        if (!isValidIsoDate(at)) {
          return {
            error: "invalid_date",
            message: `The ${due.event} date is not a real date: ${at}`,
          };
        }
        // An event for this period can only be held after the period ends
        // (the AGM adopts that year's accounts). An earlier date is another
        // year's event, recorded against the wrong period: it is not used.
        if (compareIso(at, period.end) <= 0) {
          return {
            dueOn: addDays(lastDay, due.days),
            text: fallbackText,
            warnings: [
              `The ${name} date recorded for ${period.label} (${formatDate(at)}) is not after the year ended on ${formatDate(period.end)}, so it cannot be that year's ${name} and is not used. ${due.fallback.text}. Correct the ${name} date.`,
            ],
          };
        }
        const warnings: string[] = [];
        if (compareIso(at, lastDay) > 0) {
          warnings.push(
            `The ${name} on ${formatDate(at)} is after ${formatDate(lastDay)}, the last day for it: check that an extension was granted and that the date belongs to ${period.label}.`,
          );
        }
        return {
          dueOn: addDays(at, due.days),
          text: `${rule.dueText} on ${formatDate(at)}`,
          warnings,
        };
      }
      return {
        dueOn: addDays(lastDay, due.days),
        text: fallbackText,
        warnings: [`${due.fallback.text}. Record the ${name} date for an exact due date.`],
      };
    }
  }
}

/** The extension that applies, if any: latest announcement wins. */
export function findExtension(
  ruleKey: string,
  canonicalPeriod: string,
  periodType: StatutoryRule["periodType"],
  fyStartMonth: number,
  extensions: readonly Extension[],
  facts: Record<string, MatchValue> | undefined,
): Extension | undefined {
  const matching = extensions.filter((e) => {
    if (e.ruleKey !== ruleKey) return false;
    const p = parsePeriod(e.period, periodType, fyStartMonth);
    if (!p || p.canonical !== canonicalPeriod) return false;
    if (e.where) return facts !== undefined && factsMatch(e.where, facts);
    return true;
  });
  matching.sort(
    (a, b) => compareIso(b.announcedOn, a.announcedOn) || compareIso(b.newDueOn, a.newDueOn),
  );
  return matching[0];
}

export function resolveStatutory(
  ruleKey: string,
  period: string,
  options: StatutoryResolveOptions = {},
): ResolvedDateDetail | DateError {
  const pack = options.pack ?? IN_PACK;
  const locale = options.locale ?? "en-IN";
  const fmt = (d: IsoDate) => formatDate(d, { locale });
  const rule = pack.rules.find((r) => r.key === ruleKey);
  if (!rule)
    return {
      error: "unknown_rule",
      message: `No statutory rule "${ruleKey}" in pack ${pack.version}`,
    };
  const parsed = parsePeriod(period, rule.periodType, pack.fyStartMonth);
  if (!parsed) {
    return {
      error: "bad_period",
      message: `"${period}" is not a ${rule.periodType} period for ${rule.key}`,
    };
  }
  if (
    (rule.effectiveFrom && compareIso(parsed.start, rule.effectiveFrom) < 0) ||
    (rule.effectiveTo && compareIso(parsed.start, rule.effectiveTo) > 0)
  ) {
    return {
      error: "rule_not_in_effect",
      message: `${rule.key} does not apply to ${parsed.label}`,
    };
  }
  const base = baseDueDate(rule, parsed, options.events);
  if ("error" in base) return { error: base.error, message: base.message };

  const adjustments: string[] = [];
  const warnings: string[] = [...base.warnings];
  for (const c of rule.checks ?? []) {
    if (options.facts && factsMatch(c.when, options.facts)) warnings.push(c.warning);
  }
  if (!rule.verified)
    warnings.push("Rule not yet checked against the statute by a chartered accountant.");

  let dueOn = base.dueOn;
  const ext = findExtension(
    rule.key,
    parsed.canonical,
    rule.periodType,
    pack.fyStartMonth,
    options.extensions ?? [],
    options.facts,
  );
  if (ext) {
    if (!isValidIsoDate(ext.newDueOn)) {
      return {
        error: "invalid_date",
        message: `Extension date is not a real date: ${ext.newDueOn}`,
      };
    }
    const verb = compareIso(ext.newDueOn, dueOn) >= 0 ? "Extended" : "Brought forward";
    adjustments.push(
      ext.kind === "firm"
        ? `Firm override: ${fmt(dueOn)} → ${fmt(ext.newDueOn)} (${ext.source}, ${fmt(ext.announcedOn)}).`
        : `${verb} from ${fmt(dueOn)} to ${fmt(ext.newDueOn)} by ${ext.source} (announced ${fmt(ext.announcedOn)}).`,
    );
    dueOn = ext.newDueOn;
  }
  dueOn = applyNonWorkingPolicy(
    dueOn,
    options.calendar ?? DEFAULT_CAL,
    rule.rollForward,
    locale,
    adjustments,
    warnings,
  );

  const out: ResolvedDateDetail = {
    dueOn,
    rule: { type: "statutory", ruleKey: rule.key, period: parsed.canonical },
    basis: `${rule.form} for ${parsed.label}: ${base.text}`,
    adjustments,
    warnings,
    inputs: {
      ruleKey: rule.key,
      period: parsed.canonical,
      packVersion: pack.version,
      packAsOf: pack.asOf,
      verified: rule.verified,
      ...(ext ? { extensionSource: ext.source } : {}),
      ...Object.fromEntries(
        Object.entries(options.events ?? {}).map(([k, v]) => [`event.${k}`, v]),
      ),
    },
  };
  if (dueOn !== base.dueOn) out.originalDueOn = base.dueOn;
  return out;
}
