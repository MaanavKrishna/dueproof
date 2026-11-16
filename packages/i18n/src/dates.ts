/**
 * Date and fiscal-year formatting. Dates are calendar dates ("2026-11-20"),
 * never instants: nothing here reads the clock or the machine's time zone.
 * "Today" is always passed in.
 */

export type IsoDate = string;

const ISO_RX = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface YMD {
  year: number;
  month: number; // 1–12
  day: number;
}

export function parseIsoDate(iso: IsoDate): YMD {
  const m = ISO_RX.exec(iso);
  if (!m) throw new RangeError(`Not an ISO date: ${iso}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const t = new Date(Date.UTC(year, month - 1, day));
  if (t.getUTCFullYear() !== year || t.getUTCMonth() !== month - 1 || t.getUTCDate() !== day) {
    throw new RangeError(`Not a real date: ${iso}`);
  }
  return { year, month, day };
}

function epochDay(iso: IsoDate): number {
  const { year, month, day } = parseIsoDate(iso);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return epochDay(to) - epochDay(from);
}

const EN_MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const EN_MONTHS_LONG = [
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

export interface DateFormatOptions {
  locale?: string;
  /** "short" → "20 Nov 2026" (default); "long" → "20 November 2026". */
  month?: "short" | "long";
}

/**
 * "20 Nov 2026". English locales use a fixed month table so September is
 * always "Sep" (newer ICU data writes "Sept" for en-GB/en-IN). Other locales
 * go through Intl in UTC.
 */
export function formatDate(iso: IsoDate, options: DateFormatOptions = {}): string {
  const locale = options.locale ?? "en-IN";
  const { year, month, day } = parseIsoDate(iso);
  const style = options.month ?? "short";
  if (/^en(-|$)/i.test(locale) && !/^en-US$/i.test(locale)) {
    const names = style === "short" ? EN_MONTHS_SHORT : EN_MONTHS_LONG;
    return `${day} ${names[month - 1]} ${year}`;
  }
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: style,
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "Nov 2026" — for monthly periods. */
export function formatMonth(year: number, month: number, locale = "en-IN"): string {
  if (/^en(-|$)/i.test(locale)) return `${EN_MONTHS_SHORT[month - 1]} ${year}`;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

// ---------------------------------------------------------------- fiscal years

export interface FiscalOptions {
  /** First month of the fiscal year, 1–12. India: 4 (April). */
  startMonth?: number;
}

function startMonthOf(options: FiscalOptions): number {
  const m = options.startMonth ?? 4;
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new RangeError(`Bad FY start month: ${m}`);
  return m;
}

/** The calendar year in which the fiscal year containing `iso` starts. */
export function fiscalYearStart(iso: IsoDate, options: FiscalOptions = {}): number {
  const { year, month } = parseIsoDate(iso);
  return month >= startMonthOf(options) ? year : year - 1;
}

const EN_DASH = "–";

function spanLabel(prefix: string, startYear: number, startMonth: number): string {
  if (startMonth === 1) return `${prefix} ${startYear}`;
  const end = String((startYear + 1) % 100).padStart(2, "0");
  return `${prefix} ${startYear}${EN_DASH}${end}`;
}

/** "FY 2025–26" for any date in that fiscal year (or for its start year). */
export function fyLabel(dateOrStartYear: IsoDate | number, options: FiscalOptions = {}): string {
  const startMonth = startMonthOf(options);
  const start =
    typeof dateOrStartYear === "number"
      ? dateOrStartYear
      : fiscalYearStart(dateOrStartYear, options);
  return spanLabel("FY", start, startMonth);
}

/**
 * "AY 2026–27": the assessment year that follows the fiscal year. Indian
 * income-tax usage; `dateOrStartYear` names a date in, or the start year of,
 * the *previous* (financial) year.
 */
export function ayLabel(dateOrStartYear: IsoDate | number, options: FiscalOptions = {}): string {
  const startMonth = startMonthOf(options);
  const start =
    typeof dateOrStartYear === "number"
      ? dateOrStartYear
      : fiscalYearStart(dateOrStartYear, options);
  return spanLabel("AY", start + 1, startMonth);
}
