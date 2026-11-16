import type { IsoDate } from "@dueproof/contracts";
import { formatDate } from "@dueproof/i18n";
import { nextWorkingDayOnOrAfter, nonWorkingReason, type WorkingCalendar } from "./calendar";

/**
 * Apply the non-working-day policy to a computed date. Returns the final date
 * and records what happened.
 */
export function applyNonWorkingPolicy(
  date: IsoDate,
  cal: WorkingCalendar,
  roll: boolean,
  locale: string,
  adjustments: string[],
  warnings: string[],
  what = "The due date",
): IsoDate {
  const reason = nonWorkingReason(date, cal);
  if (!reason) return date;
  const shown = formatDate(date, { locale });
  if (cal.workingDays.length === 0) {
    warnings.push(`${what} (${shown}) falls on ${reason}, and no working days are set.`);
    return date;
  }
  if (roll) {
    const moved = nextWorkingDayOnOrAfter(date, cal);
    adjustments.push(
      `${shown} is ${reason}; moved to the next working day, ${formatDate(moved, { locale })} (roll-forward on for this rule; verify).`,
    );
    return moved;
  }
  warnings.push(
    `${what} (${shown}) falls on ${reason}. Not moved: check whether the next working day is allowed.`,
  );
  return date;
}
