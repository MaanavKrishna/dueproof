/**
 * A tiny message catalogue. v0.1 ships English only (02 §12); every string
 * still goes through a key so translation later is a data change.
 *
 * - `{name}` interpolates a parameter (numbers are formatted for the locale).
 * - Plurals: if `params.count` is a number and `key.one` / `key.other` (or any
 *   Intl.PluralRules category) exist, the matching form is used.
 * - A missing key returns the key itself, so gaps are visible, never blank.
 */

export type Catalogue = Readonly<Record<string, string>>;
export type MessageParams = Readonly<Record<string, string | number>>;

export const en = {
  // Due ladder (02 §2): always an icon and a word.
  "due.overdue": "Overdue",
  "due.today": "Today",
  "due.thisWeek": "This week",
  "due.later": "Later",
  "due.done": "Done",

  // Today buckets (01 §4).
  "today.overdue": "Overdue",
  "today.dueToday": "Due today",
  "today.thisWeek": "This week",
  "today.needsReview": "Needs review",
  "today.hearingsThisWeek": "Hearings this week",
  "today.recentlyReceived": "Recently received",
  "today.awaitingApproval": "Awaiting approval",
  "today.summary": "{overdue} overdue, {thisWeek} due this week, {review} to review",

  // Relative due dates.
  "relative.today": "today",
  "relative.tomorrow": "tomorrow",
  "relative.inDays.one": "in {count} day",
  "relative.inDays.other": "in {count} days",
  "relative.overdue.one": "{count} day overdue",
  "relative.overdue.other": "{count} days overdue",

  // Labels around computed figures.
  "money.estimate": "Estimate from the stated inputs, not advice",
  "statutory.dataAsOf": "Calendar data as of {date}",
  "statutory.verify": "To be verified against the statute",
  "statutory.firmOverride": "Firm override",
  "date.condonationWindow": "Condonation window to {date}",
} as const satisfies Catalogue;

export type EnglishKey = keyof typeof en;

const PARAM_RX = /\{(\w+)\}/g;

export interface TranslatorOptions {
  locale?: string;
  catalogue?: Catalogue;
  /** Used when the main catalogue lacks a key. Default: English. */
  fallback?: Catalogue;
}

export type Translate = (key: string, params?: MessageParams) => string;

export function createTranslator(options: TranslatorOptions = {}): Translate {
  const locale = options.locale ?? "en-IN";
  const main: Catalogue = options.catalogue ?? en;
  const fallback: Catalogue = options.fallback ?? en;
  const plural = new Intl.PluralRules(locale);
  const numbers = new Intl.NumberFormat(locale);

  const lookup = (key: string): string | undefined => main[key] ?? fallback[key];

  return (key, params) => {
    let template: string | undefined;
    const count = params?.count;
    if (typeof count === "number") {
      template = lookup(`${key}.${plural.select(count)}`) ?? lookup(`${key}.other`);
    }
    template ??= lookup(key);
    if (template === undefined) return key;
    if (!params) return template;
    return template.replace(PARAM_RX, (whole, name: string) => {
      const value = params[name];
      if (value === undefined) return whole;
      return typeof value === "number" ? numbers.format(value) : value;
    });
  };
}

/** The default English translator. */
export const t: Translate = createTranslator();
