/**
 * Calendar arithmetic on ISO dates ("2026-11-20"). Dates are days, not
 * instants: everything is done on UTC day numbers, so the machine's time
 * zone can never shift a due date. Nothing here reads the clock.
 */
import type { IsoDate } from "@dueproof/contracts";

const ISO_RX = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface YMD {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

export function isValidIsoDate(iso: string): boolean {
  const m = ISO_RX.exec(iso);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseIso(iso: IsoDate): YMD {
  if (!isValidIsoDate(iso)) throw new RangeError(`Not a real ISO date: ${iso}`);
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
  };
}

export function toIso({ year, month, day }: YMD): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Days since 1970-01-01. */
export function epochDay(iso: IsoDate): number {
  const { year, month, day } = parseIso(iso);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function fromEpochDay(n: number): IsoDate {
  const d = new Date(n * MS_PER_DAY);
  return toIso({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromEpochDay(epochDay(iso) + days);
}

/** Whole days from `from` to `to`; positive when `to` is later. */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return epochDay(to) - epochDay(from);
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxIso(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

export function minIso(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

/**
 * The same day `months` later; if that month is shorter, the last day of it
 * (31 Jan + 1 month → 28/29 Feb). Clamping is recorded by the caller.
 */
export function addMonths(iso: IsoDate, months: number): { date: IsoDate; clamped: boolean } {
  const { year, month, day } = parseIso(iso);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const last = daysInMonth(y, m);
  return { date: toIso({ year: y, month: m, day: Math.min(day, last) }), clamped: day > last };
}

/** A day in a given month, clamped to the month's end ("31st" of February → 28/29). */
export function dayOfMonth(year: number, month: number, day: number): IsoDate {
  const index = year * 12 + (month - 1);
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return toIso({ year: y, month: m, day: Math.min(day, daysInMonth(y, m)) });
}

export function lastDayOfMonth(year: number, month: number): IsoDate {
  return dayOfMonth(year, month, 31);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: IsoDate): number {
  const dow = new Date(epochDay(iso) * MS_PER_DAY).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
}

export const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface WorkingCalendar {
  /** ISO weekdays that are working days, 1 = Mon … 7 = Sun. */
  workingDays: readonly number[];
  holidays: readonly IsoDate[];
}

export function isWorkingDay(iso: IsoDate, cal: WorkingCalendar): boolean {
  return cal.workingDays.includes(isoWeekday(iso)) && !cal.holidays.includes(iso);
}

/** Why a day is not a working day, in plain words, or null if it is one. */
export function nonWorkingReason(iso: IsoDate, cal: WorkingCalendar): string | null {
  if (cal.holidays.includes(iso)) return "a holiday";
  if (!cal.workingDays.includes(isoWeekday(iso))) return `a ${WEEKDAY_NAMES[isoWeekday(iso) - 1]}`;
  return null;
}

/** The first working day on or after `iso`. Throws if the calendar has no working days. */
export function nextWorkingDayOnOrAfter(iso: IsoDate, cal: WorkingCalendar): IsoDate {
  if (cal.workingDays.length === 0) throw new RangeError("The calendar has no working days");
  let d = iso;
  // A year of consecutive holidays would be a data error; stop well before looping forever.
  for (let i = 0; i < 400; i++) {
    if (isWorkingDay(d, cal)) return d;
    d = addDays(d, 1);
  }
  throw new RangeError(`No working day within 400 days of ${iso}`);
}

/**
 * The `n`th working day after `iso` (the anchor day itself is not counted).
 */
export function addWorkingDays(iso: IsoDate, n: number, cal: WorkingCalendar): IsoDate {
  if (cal.workingDays.length === 0) throw new RangeError("The calendar has no working days");
  let d = iso;
  let left = n;
  let guard = 0;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d, cal)) left--;
    if (++guard > n * 7 + 800)
      throw new RangeError(`Could not count ${n} working days from ${iso}`);
  }
  return d;
}
