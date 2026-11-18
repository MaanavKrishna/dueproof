/**
 * Is a `DateRule` fully derivable from the words of its quote? (house rules
 * 2 and 3). A model may only *copy* a date or a period from the page; it may
 * never compute, convert or guess one. This is the check, used twice: by the
 * AI schema check (packages/ai), which drops a rule that fails it, and by
 * `reconcile`, which never lets an AI-only date become a deadline without a
 * person unless it passes.
 *
 *   fixed      the quote writes that exact day, month and year, in a format
 *              the engine reads ("20.10.2026", "20 October 2026",
 *              "October 20, 2026", "2026-10-20", "2026 ഒക്ടോബർ 20-ന്"…).
 *              The "30" of "within 30 days" is not a day of the month.
 *   relative   the quote writes the amount and the unit together ("30 days",
 *              "thirty (30) days", "2 weeks" for 14 days, "one month"), the
 *              same for a condonable period, and does not name a different
 *              anchor than the rule's ("from the date of service" is not
 *              "from receipt"). With no anchor named, only `issue` (the
 *              earliest, and the engine's own default) is accepted.
 *   statutory  the rule key exists in the pack, the period is valid for it,
 *              and the quote names both the form ("GSTR-3B") and the period
 *              ("October 2026", "FY 2025-26", "Q1 … 2026-27").
 *
 * Pure: no I/O, deterministic. Never throws, whatever the input.
 */
import type { DateRule } from "@dueproof/contracts";
import { isValidIsoDate } from "./dates/calendar";
import { MAX_PERIOD } from "./dates/engine";
import { IN_PACK } from "./statutory/packs/in";
import { parsePeriod } from "./statutory/periods";
import type { StatutoryPack } from "./statutory/types";

export type DerivationIssue =
  | "rule_malformed"
  | "rule_out_of_bounds"
  | "fixed_date_not_in_quote"
  | "relative_period_not_in_quote"
  | "relative_anchor_not_in_quote"
  | "condonable_not_in_quote"
  | "statutory_rule_unknown"
  | "statutory_period_invalid"
  | "statutory_form_not_in_quote"
  | "statutory_period_not_in_quote";

// ------------------------------------------------------------------ text

/** Indic and full-width digit blocks (each ten consecutive code points) → ASCII. */
const DIGIT_ZEROS = [
  0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0xff10,
];
export function asciiDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    const zero = DIGIT_ZEROS.find((z) => cp >= z && cp <= z + 9);
    out += zero === undefined ? ch : String(cp - zero);
  }
  return out;
}

function prepare(quote: string): string {
  return asciiDigits(quote.normalize("NFC")).toLowerCase();
}

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alternation = (words: Iterable<string>) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map(escapeRx)
    .join("|");

// ------------------------------------------------------------------ months

const EN_MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** Month names the engine's profiles read, plus Hindi. Lower case, NFC. */
const MONTHS: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>();
  EN_MONTHS.forEach((name, i) => {
    m.set(name, i + 1);
    m.set(name.slice(0, 3), i + 1);
  });
  m.set("sept", 9);
  const local: [string, number][] = [
    // Malayalam (services/engine/dueproof_engine/profiles/metro_rail_ml.py)
    ["ജനുവരി", 1],
    ["ഫെബ്രുവരി", 2],
    ["മാർച്ച്", 3],
    ["ഏപ്രിൽ", 4],
    ["മേയ്", 5],
    ["മെയ്", 5],
    ["ജൂൺ", 6],
    ["ജൂലൈ", 7],
    ["ഓഗസ്റ്റ്", 8],
    ["ആഗസ്റ്റ്", 8],
    ["സെപ്റ്റംബർ", 9],
    ["ഒക്ടോബർ", 10],
    ["ഒക്‌ടോബർ", 10],
    ["നവംബർ", 11],
    ["ഡിസംബർ", 12],
    // Hindi
    ["जनवरी", 1],
    ["फरवरी", 2],
    ["फ़रवरी", 2],
    ["मार्च", 3],
    ["अप्रैल", 4],
    ["मई", 5],
    ["जून", 6],
    ["जुलाई", 7],
    ["अगस्त", 8],
    ["सितंबर", 9],
    ["सितम्बर", 9],
    ["अक्टूबर", 10],
    ["अक्तूबर", 10],
    ["नवंबर", 11],
    ["नवम्बर", 11],
    ["दिसंबर", 12],
    ["दिसम्बर", 12],
  ];
  for (const [name, n] of local) m.set(name.normalize("NFC"), n);
  return m;
})();

const M = alternation(MONTHS.keys());
/** What may sit between a month name and a number: spaces, punctuation, joiners, combining marks. */
const SEP = "[\\s,.\\-\\u200c\\u200d\\p{M}]*";
const NOT_ALNUM_BEFORE = "(?<![\\p{L}\\p{N}])";
const NOT_DIGIT_AFTER = "(?!\\d)";
const ORD = "(?:st|nd|rd|th)?";

/** (regex, [year, month, day] group indexes). */
const DATE_PATTERNS: [RegExp, [number, number, number]][] = [
  // 2026-10-20
  [new RegExp(`(?<!\\d)(\\d{4})-(\\d{1,2})-(\\d{1,2})${NOT_DIGIT_AFTER}`, "gu"), [1, 2, 3]],
  // 20.10.2026, 20/10/2026, 20-10-2026 (day first, as written in India)
  [
    new RegExp(
      `(?<!\\d)(\\d{1,2})\\s*[/.\\-]\\s*(\\d{1,2})\\s*[/.\\-]\\s*(\\d{4})${NOT_DIGIT_AFTER}`,
      "gu",
    ),
    [3, 2, 1],
  ],
  // 20 October 2026, 20th of Oct., 2026, 20-Oct-2026
  [
    new RegExp(
      `(?<!\\d)(\\d{1,2})\\s*${ORD}\\s*(?:day\\s+of\\s+|of\\s+)?[\\s\\-]*(${M})(?![a-z])${SEP}(\\d{4})${NOT_DIGIT_AFTER}`,
      "gu",
    ),
    [3, 2, 1],
  ],
  // October 20, 2026
  [
    new RegExp(
      `${NOT_ALNUM_BEFORE}(${M})(?![a-z])${SEP}(\\d{1,2})\\s*${ORD}${SEP}(\\d{4})${NOT_DIGIT_AFTER}`,
      "gu",
    ),
    [3, 1, 2],
  ],
  // 2026 ഒക്ടോബർ 20-ന് (year first, as many Indian languages write it)
  [
    new RegExp(`(?<!\\d)(\\d{4})${SEP}(${M})(?![a-z])${SEP}(\\d{1,2})${NOT_DIGIT_AFTER}`, "gu"),
    [1, 2, 3],
  ],
];

const pad2 = (n: number) => String(n).padStart(2, "0");

function monthNumber(raw: string): number | undefined {
  if (/^\d+$/.test(raw)) return Number(raw);
  return MONTHS.get(raw.normalize("NFC").toLowerCase());
}

/** Every complete, real calendar date (day, month and year) written in the quote, as ISO. */
export function datesInQuote(quote: string): string[] {
  if (typeof quote !== "string") return [];
  const text = prepare(quote);
  const out = new Set<string>();
  for (const [rx, [yi, mi, di]] of DATE_PATTERNS) {
    rx.lastIndex = 0;
    for (const m of text.matchAll(rx)) {
      const year = Number(m[yi]);
      const month = monthNumber(m[mi] ?? "");
      const day = Number(m[di]);
      if (month === undefined) continue;
      const iso = `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
      if (isValidIsoDate(iso)) out.add(iso);
    }
  }
  return [...out].sort();
}

// ------------------------------------------------------------------ periods

const UNITS: [string, "days" | "working_days" | "months" | "weeks"][] = [
  ["working days", "working_days"],
  ["working day", "working_days"],
  ["business days", "working_days"],
  ["business day", "working_days"],
  ["work days", "working_days"],
  ["work day", "working_days"],
  ["calendar days", "days"],
  ["clear days", "days"],
  ["days", "days"],
  ["day", "days"],
  ["weeks", "weeks"],
  ["week", "weeks"],
  ["calendar months", "months"],
  ["months", "months"],
  ["month", "months"],
  // Hindi
  ["कार्य दिवसों", "working_days"],
  ["कार्य दिवस", "working_days"],
  ["दिनों", "days"],
  ["दिन", "days"],
  ["दिवसों", "days"],
  ["दिवस", "days"],
  ["सप्ताह", "weeks"],
  ["महीनों", "months"],
  ["महीने", "months"],
  ["महीना", "months"],
  ["माह", "months"],
  // Malayalam
  ["പ്രവൃത്തി ദിവസ", "working_days"],
  ["ദിവസ", "days"],
  ["ആഴ്ച", "weeks"],
  ["മാസ", "months"],
];
const UNIT_OF = new Map(UNITS.map(([w, u]) => [w.normalize("NFC"), u]));

const SMALL: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const ONES = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const NUMBER_WORDS = `(?:(?:${Object.keys(TENS).join("|")})(?:[\\s\\-](?:${ONES.join("|")}))?|${Object.keys(SMALL).join("|")})`;

function wordValue(raw: string): number | undefined {
  const w = raw.toLowerCase().trim();
  if (/^\d+$/.test(w)) return Number(w);
  if (w in SMALL) return SMALL[w];
  const [tens, ones] = w.split(/[\s-]/);
  if (tens && tens in TENS) {
    if (!ones) return TENS[tens];
    const i = ONES.indexOf(ones);
    if (i >= 0) return (TENS[tens] as number) + i + 1;
  }
  return undefined;
}

const PERIOD_RX = new RegExp(
  `${NOT_ALNUM_BEFORE}(\\d{1,6}|${NUMBER_WORDS})(?![\\p{L}\\p{N}])\\s*(?:\\(\\s*[^()]{1,30}?\\s*\\)\\s*)?(${alternation(UNIT_OF.keys())})`,
  "gu",
);

export interface QuotedPeriod {
  amount: number;
  unit: "days" | "working_days" | "months";
}

/**
 * Every period written in the quote as a number (or number word) followed by a
 * unit. Weeks are given as days (2 weeks → 14 days), as the engine counts them.
 */
export function periodsInQuote(quote: string): QuotedPeriod[] {
  if (typeof quote !== "string") return [];
  const text = prepare(quote).replace(/\s+/g, " ");
  const out: QuotedPeriod[] = [];
  PERIOD_RX.lastIndex = 0;
  for (const m of text.matchAll(PERIOD_RX)) {
    const amount = wordValue(m[1] ?? "");
    const unitWord = (m[2] ?? "").normalize("NFC");
    // English unit words must end at a word boundary ("days", not "daystar").
    const end = (m.index ?? 0) + m[0].length;
    if (/^[a-z ]+$/.test(unitWord) && /[a-z]/.test(text[end] ?? "")) continue;
    const unit = UNIT_OF.get(unitWord);
    if (amount === undefined || !unit) continue;
    if (unit === "weeks") out.push({ amount: amount * 7, unit: "days" });
    else out.push({ amount, unit });
  }
  return out;
}

// ------------------------------------------------------------------ anchors

type RelAnchor = "receipt" | "issue" | "order" | "service" | "hearing";

const ANCHOR_WORDS: [RelAnchor, RegExp][] = [
  ["receipt", /receipt|\breceived?\b|\breceiving\b|प्राप्ति|प्राप्त|ലഭിച്ച/u],
  [
    "issue",
    /\bissu(?:e|ed|ance)\b|date of (?:this|the) (?:notice|letter|circular|communication|memo|summons)|जारी/u,
  ],
  ["order", /(?:date of|from)\s+(?:the\s+)?(?:this\s+|said\s+|impugned\s+)?order\b|आदेश/u],
  ["service", /\bservice of\b|\bserved\b|\bcommunicat(?:ed|ion)\b|तामील/u],
  ["hearing", /\bhearing\b|सुनवाई/u],
];

/** The anchors a quote names ("of receipt", "from the date of the order", …). */
export function anchorsInQuote(quote: string): RelAnchor[] {
  if (typeof quote !== "string") return [];
  const text = prepare(quote);
  return ANCHOR_WORDS.filter(([, rx]) => rx.test(text)).map(([a]) => a);
}

// ------------------------------------------------------------------ statutory

function formPattern(form: string): RegExp | null {
  const core = form
    .replace(/\(.*?\)/g, " ")
    .replace(/^\s*form\s+/i, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (core.length === 0) return null;
  return new RegExp(`(?<![a-z0-9])${core.map(escapeRx).join("[\\s\\-./]*")}(?![a-z0-9])`, "u");
}

function fyWritten(text: string, fyStart: number, fyStartMonth: number): boolean {
  if (fyStartMonth === 1) return new RegExp(`(?<!\\d)${fyStart}(?!\\d)`).test(text);
  const next = fyStart + 1;
  return new RegExp(
    `(?<!\\d)${fyStart}\\s*[-–/]\\s*(?:${next}|${String(next % 100).padStart(2, "0")})(?!\\d)`,
  ).test(text);
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
const ORDINAL_SUFFIX = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

function indexWritten(text: string, n: number, words: string, letter: string): boolean {
  const ord = `(?:${ORDINALS[n - 1]}|${ORDINAL_SUFFIX[n - 1]})`;
  return new RegExp(
    `(?<![a-z0-9])(?:${letter}\\s*-?\\s*${n}(?!\\d)|${ord}\\s+${words}|${words}\\s*(?:no\\.?\\s*)?${n}(?!\\d))`,
    "u",
  ).test(text);
}

function monthWritten(text: string, year: number, month: number): boolean {
  const names = [...MONTHS].filter(([, n]) => n === month).map(([w]) => w);
  const named = new RegExp(`(?<![a-z])(?:${alternation(names)})(?![a-z])`, "u").test(text);
  const hasYear = new RegExp(`(?<!\\d)${year}(?!\\d)`).test(text);
  if (named && hasYear) return true;
  // 10/2026, 10-2026, 2026-10
  return new RegExp(
    `(?<!\\d)(?:0?${month}\\s*[/.\\-]\\s*${year}|${year}\\s*[/.\\-]\\s*0?${month})(?!\\d)`,
  ).test(text);
}

function statutoryIssue(
  rule: { ruleKey: string; period: string },
  text: string,
  pack: StatutoryPack,
): DerivationIssue | null {
  const def = pack.rules.find((r) => r.key === rule.ruleKey);
  if (!def) return "statutory_rule_unknown";
  const p = parsePeriod(rule.period, def.periodType, pack.fyStartMonth);
  if (!p) return "statutory_period_invalid";
  const form = formPattern(def.form);
  if (!form?.test(text)) return "statutory_form_not_in_quote";
  let ok: boolean;
  switch (p.type) {
    case "month": {
      ok = monthWritten(text, Number(p.start.slice(0, 4)), Number(p.start.slice(5, 7)));
      break;
    }
    case "fy":
      ok = fyWritten(text, p.fyStart, pack.fyStartMonth);
      break;
    case "quarter":
      ok =
        fyWritten(text, p.fyStart, pack.fyStartMonth) &&
        indexWritten(text, p.index ?? 0, "quarter", "q");
      break;
    case "fy_instalment":
      ok =
        fyWritten(text, p.fyStart, pack.fyStartMonth) &&
        indexWritten(text, p.index ?? 0, "instal(?:l)?ment", "i");
      break;
  }
  return ok ? null : "statutory_period_not_in_quote";
}

// ------------------------------------------------------------------ the check

export interface DeriveOptions {
  /** Statutory pack for rule keys. Default: the India pack. */
  pack?: StatutoryPack;
}

const hasPeriod = (ps: QuotedPeriod[], amount: number, unit: string) =>
  ps.some((p) => p.amount === amount && p.unit === unit);

/**
 * Null when every part of the rule is written in the quote; otherwise the
 * first thing that is not. Never throws.
 */
export function ruleDerivationIssue(
  rule: DateRule,
  quote: string,
  opts: DeriveOptions = {},
): DerivationIssue | null {
  try {
    if (!rule || typeof rule !== "object" || typeof quote !== "string") return "rule_malformed";
    switch (rule.type) {
      case "fixed":
        if (typeof rule.date !== "string" || !isValidIsoDate(rule.date))
          return "fixed_date_not_in_quote";
        return datesInQuote(quote).includes(rule.date) ? null : "fixed_date_not_in_quote";

      case "relative": {
        const { amount, unit, anchor, condonable } = rule;
        if (!Number.isInteger(amount) || amount <= 0) return "rule_malformed";
        if (!(unit in MAX_PERIOD)) return "rule_malformed";
        if (amount > MAX_PERIOD[unit]) return "rule_out_of_bounds";
        const periods = periodsInQuote(quote);
        if (!hasPeriod(periods, amount, unit)) return "relative_period_not_in_quote";
        if (condonable) {
          if (!Number.isInteger(condonable.amount) || condonable.amount <= 0)
            return "rule_malformed";
          if (condonable.amount > (MAX_PERIOD[condonable.unit] ?? 0)) return "rule_out_of_bounds";
          if (!hasPeriod(periods, condonable.amount, condonable.unit))
            return "condonable_not_in_quote";
        }
        const named = anchorsInQuote(quote);
        if (named.length === 0 ? anchor !== "issue" : !named.includes(anchor))
          return "relative_anchor_not_in_quote";
        return null;
      }

      case "statutory":
        if (typeof rule.ruleKey !== "string" || typeof rule.period !== "string")
          return "rule_malformed";
        return statutoryIssue(rule, prepare(quote), opts.pack ?? IN_PACK);

      default:
        return "rule_malformed";
    }
  } catch {
    return "rule_malformed";
  }
}

/** True when every part of the rule is written in the quote. */
export function ruleDerivableFromQuote(
  rule: DateRule,
  quote: string,
  opts: DeriveOptions = {},
): boolean {
  return ruleDerivationIssue(rule, quote, opts) === null;
}
