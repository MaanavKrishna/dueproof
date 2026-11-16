/**
 * The statutory compliance calendar: from a client's registrations and the
 * pack's rules, every obligation whose due date falls within a range.
 * No AI, no I/O: data in, items out (01 §4, 03 §8a).
 */
import type { IsoDate } from "@dueproof/contracts";
import { addMonths, compareIso, type WorkingCalendar } from "../dates/calendar";
import { isDateError } from "../dates/types";
import { registrationFacts, ruleApplies } from "./match";
import { IN_PACK } from "./packs/in";
import { periodsStartingBetween } from "./periods";
import { resolveStatutory } from "./resolve";
import type { Extension, Registration, StatutoryItem, StatutoryPack } from "./types";

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

export interface GenerateOptions {
  /** Org working days and holidays, used only to flag non-working due dates. */
  calendar?: WorkingCalendar;
  locale?: string;
}

/** How far before `from` a period may start and still fall due inside the range. */
const LOOKBACK_MONTHS = 36;

export function generateStatutory(
  registrations: readonly Registration[],
  range: DateRange,
  pack: StatutoryPack = IN_PACK,
  extensions: readonly Extension[] = [],
  options: GenerateOptions = {},
): StatutoryItem[] {
  if (compareIso(range.from, range.to) > 0) return [];
  const items: StatutoryItem[] = [];
  const earliestStart = addMonths(range.from, -LOOKBACK_MONTHS).date;

  for (const reg of registrations) {
    const facts = registrationFacts(reg, pack);
    for (const rule of pack.rules) {
      if (!ruleApplies(rule, reg, facts)) continue;
      const instalments = rule.due.type === "instalments" ? rule.due.dates.length : 0;
      const periods = periodsStartingBetween(
        rule.periodType,
        earliestStart,
        range.to,
        pack.fyStartMonth,
        instalments,
      );
      for (const p of periods) {
        // The registration must cover at least part of the period.
        if (reg.validFrom && compareIso(p.end, reg.validFrom) < 0) continue;
        if (reg.validTo && compareIso(p.start, reg.validTo) > 0) continue;
        const events = reg.events?.[p.canonical];
        const r = resolveStatutory(rule.key, p.canonical, {
          pack,
          extensions,
          facts,
          ...(events ? { events } : {}),
          ...(options.calendar ? { calendar: options.calendar } : {}),
          ...(options.locale ? { locale: options.locale } : {}),
        });
        if (isDateError(r)) continue; // e.g. a rule not yet in effect for an old period
        if (compareIso(r.dueOn, range.from) < 0 || compareIso(r.dueOn, range.to) > 0) continue;
        const item: StatutoryItem = {
          statutoryKey: `${rule.key}:${p.canonical}`,
          ruleKey: rule.key,
          period: p.canonical,
          periodLabel: p.label,
          form: rule.form,
          title: rule.title,
          registrationId: reg.id,
          dueOn: r.dueOn,
          originalDueOn: r.originalDueOn ?? r.dueOn,
          basis: r.basis,
          rule: { type: "statutory", ruleKey: rule.key, period: p.canonical },
          adjustments: r.adjustments,
          warnings: r.warnings,
          source: rule.source,
          verified: rule.verified,
          packVersion: pack.version,
          packAsOf: pack.asOf,
        };
        if (reg.clientId) item.clientId = reg.clientId;
        items.push(item);
      }
    }
  }
  return items.sort(
    (a, b) =>
      compareIso(a.dueOn, b.dueOn) ||
      a.registrationId.localeCompare(b.registrationId) ||
      a.statutoryKey.localeCompare(b.statutoryKey),
  );
}
