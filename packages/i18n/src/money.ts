/**
 * Money formatting. Amounts arrive as integer minor units (paise for INR) and
 * are never turned into floats: the decimal string is built from integers and
 * handed to Intl as an exact decimal.
 *
 *   formatMoney(45230000)                      → "₹4,52,300"
 *   formatMoney(45230050)                      → "₹4,52,300.50"
 *   formatMoney(45230000, { compact: true })   → "₹4.52 lakh"
 *   formatMoney(120000000_00, { compact: true }) → "₹120 crore"
 *   formatMoney(120000000, { locale: "en-US", currency: "USD", compact: true }) → "$1.2M"
 */

export type MinorAmount = number | bigint;

export interface MoneyFormatOptions {
  /** BCP-47 locale. Default "en-IN". */
  locale?: string;
  /** ISO 4217 currency. Default "INR". */
  currency?: string;
  /** Short form: lakh/crore for INR in Indian locales, Intl compact (K/M/B) elsewhere. */
  compact?: boolean;
}

const DEFAULT_LOCALE = "en-IN";
const DEFAULT_CURRENCY = "INR";

function toBigInt(minor: MinorAmount): bigint {
  if (typeof minor === "bigint") return minor;
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Money must be an integer number of minor units, got ${minor}`);
  }
  return BigInt(minor);
}

/** Number of minor-unit digits for a currency (2 for INR, 0 for JPY). */
export function minorDigits(currency: string, locale = DEFAULT_LOCALE): number {
  return (
    new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

/** Exact decimal string for an integer amount of minor units: 4523005n, 2 → "45230.05". */
export function minorToDecimalString(minor: MinorAmount, digits: number): string {
  const v = toBigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  if (digits === 0) return `${neg ? "-" : ""}${abs}`;
  const scale = 10n ** BigInt(digits);
  const whole = abs / scale;
  const frac = (abs % scale).toString().padStart(digits, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

/** Divide and round half away from zero, in integers. */
export function divRound(n: bigint, d: bigint): bigint {
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return neg ? -q : q;
}

/** Intl accepts exact decimal strings (Intl.NumberFormat v3); the lib types lag behind. */
type DecimalFormatter = { format(value: string): string };

function isIndian(locale: string): boolean {
  return /-IN$/i.test(locale) || /^(hi|bn|ta|te|ml|kn|mr|gu|pa|or|as)(-|$)/i.test(locale);
}

/** "4.52" from hundredths 452; "1.2" from 120; "120" from 12000. */
function trimHundredths(hundredths: bigint, locale: string): string {
  const whole = hundredths / 100n;
  const frac = hundredths % 100n;
  const wholeText = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(whole);
  if (frac === 0n) return wholeText;
  const fracText = frac.toString().padStart(2, "0").replace(/0+$/, "");
  return `${wholeText}.${fracText}`;
}

const LAKH_PAISE = 100_000n * 100n; // ₹1,00,000
const CRORE_PAISE = 10_000_000n * 100n; // ₹1,00,00,000

/** "₹4.52 lakh", "₹1.2 crore". Below one lakh the full amount is shown. INR only. */
export function formatIndianCompact(minor: MinorAmount, locale = DEFAULT_LOCALE): string {
  const v = toBigInt(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const sign = neg ? "-" : "";
  if (abs < LAKH_PAISE) return formatMoney(v, { locale, currency: "INR" });
  // Two decimals of a lakh, rounded half up; promote to crore if rounding reaches 100 lakh.
  const lakhHundredths = divRound(abs * 100n, LAKH_PAISE);
  if (abs < CRORE_PAISE && lakhHundredths < 10_000n) {
    return `${sign}₹${trimHundredths(lakhHundredths, locale)} lakh`;
  }
  const croreHundredths = divRound(abs * 100n, CRORE_PAISE);
  return `${sign}₹${trimHundredths(croreHundredths, locale)} crore`;
}

/** Full or compact money, from integer minor units. */
export function formatMoney(minor: MinorAmount, options: MoneyFormatOptions = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const currency = options.currency ?? DEFAULT_CURRENCY;
  if (options.compact && currency === "INR" && isIndian(locale)) {
    return formatIndianCompact(minor, locale);
  }
  const digits = minorDigits(currency, locale);
  const v = toBigInt(minor);
  const scale = 10n ** BigInt(digits);
  const hasFraction = v % scale !== 0n;
  const decimal = minorToDecimalString(v, digits);
  if (options.compact) {
    const f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }) as unknown as DecimalFormatter;
    return f.format(decimal);
  }
  const f = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: hasFraction ? digits : 0,
    maximumFractionDigits: digits,
  }) as unknown as DecimalFormatter;
  return f.format(decimal);
}

/** A plain number with locale grouping: 452300 → "4,52,300" (en-IN), "452,300" (en-US). */
export function formatNumber(value: number | bigint, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale).format(value);
}
