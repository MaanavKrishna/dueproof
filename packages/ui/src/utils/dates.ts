/**
 * Calendar-grid arithmetic for the date picker and calendar. These are display
 * helpers only (which day sits in which cell); due dates themselves are
 * computed by packages/core and passed in. Dates are ISO calendar dates
 * ("2026-11-20"), handled in UTC so the machine's time zone never shifts them.
 */
import { formatDate, type IsoDate, parseIsoDate } from "@dueproof/i18n";

export type { IsoDate };

const MS_PER_DAY = 86_400_000;

function toUtc(iso: IsoDate): Date {
  const { year, month, day } = parseIsoDate(iso);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtc(d: Date): IsoDate {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isIsoDate(value: string): boolean {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromUtc(new Date(toUtc(iso).getTime() + days * MS_PER_DAY));
}

/** Same day of the month, clamped to the month's last day (31 Jan + 1 month → 28/29 Feb). */
export function addMonths(iso: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIsoDate(iso);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return fromUtc(first);
}

/** 0 = Monday … 6 = Sunday (Indian and ISO weeks start on Monday). */
export function weekday(iso: IsoDate): number {
  return (toUtc(iso).getUTCDay() + 6) % 7;
}

export function startOfMonth(iso: IsoDate): IsoDate {
  return `${iso.slice(0, 7)}-01`;
}

export function startOfWeek(iso: IsoDate): IsoDate {
  return addDays(iso, -weekday(iso));
}

export function sameMonth(a: IsoDate, b: IsoDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** Six rows of seven days covering the month that contains `iso`, Monday first. */
export function monthMatrix(iso: IsoDate): IsoDate[][] {
  const start = startOfWeek(startOfMonth(iso));
  return Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => addDays(start, r * 7 + c)),
  );
}

export function weekDays(iso: IsoDate): IsoDate[] {
  const start = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "November 2026". */
export function monthTitle(iso: IsoDate): string {
  const { year, month } = parseIsoDate(iso);
  return `${MONTH_LONG[month - 1]} ${year}`;
}

/** "20 Nov 2026". */
export function shortDate(iso: IsoDate): string {
  return formatDate(iso);
}

/** "Friday, 20 November 2026" — for accessible names. */
export function longDate(iso: IsoDate): string {
  return `${WEEKDAY_LONG[weekday(iso)]}, ${formatDate(iso, { month: "long" })}`;
}

/** Today's date in India (IST, UTC+5:30), whatever the machine's time zone. */
export function todayInIST(now: Date = new Date()): IsoDate {
  return fromUtc(new Date(now.getTime() + 330 * 60_000));
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Read a typed date the Indian way: "20/11/2026", "20-11-2026", "20.11.26",
 * "20 Nov 2026", "20 November 2026" or ISO "2026-11-20". Day comes first.
 * Returns null when it isn't a real date.
 */
export function parseIndianDate(text: string): IsoDate | null {
  const t = text.trim();
  if (!t) return null;
  const build = (y: number, m: number, d: number): IsoDate | null => {
    const year = y < 100 ? 2000 + y : y;
    const iso = `${String(year).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return isIsoDate(iso) ? iso : null;
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (m) return build(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{2}|\d{4})$/.exec(t);
  if (m) {
    const month =
      MONTH_INDEX[(m[2] ?? "").toLowerCase().slice(0, 4)] ??
      MONTH_INDEX[(m[2] ?? "").toLowerCase().slice(0, 3)];
    if (!month) return null;
    return build(Number(m[3]), month, Number(m[1]));
  }
  return null;
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
