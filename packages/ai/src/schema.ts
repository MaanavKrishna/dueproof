/**
 * What a model may return for extraction, and how it is checked.
 *
 * The model returns findings shaped like the engine's `EngineFinding`
 * (packages/contracts), with every optional field present and nullable so the
 * same JSON schema works for Anthropic and OpenAI structured outputs.
 *
 * Rules enforced here (04 §1, house rules 2 and 3):
 *  - a due date is only ever a `DateRule`; any other date-like field rejects the finding;
 *  - a `fixed` rule's day must be written in the quote (the model may copy a date, never compute one);
 *  - an amount must be written in the quote (no model arithmetic);
 *  - display text may not carry an ISO date that is not in the quote;
 *  - anything malformed is dropped, finding by finding, with a reason.
 */
import { DateRule, type engine, FindingKind } from "@dueproof/contracts";
import { z } from "zod";

type EngineFinding = engine.EngineFinding;

// ------------------------------------------------------------ JSON schema

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

const dateRuleJsonSchema = {
  anyOf: [
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["fixed"] },
        date: {
          type: "string",
          description: "YYYY-MM-DD, only when the page states this exact date",
        },
      },
      required: ["type", "date"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["relative"] },
        anchor: { type: "string", enum: ["receipt", "issue", "order", "service", "hearing"] },
        amount: { type: "integer" },
        unit: { type: "string", enum: ["days", "working_days", "months"] },
        condonable: nullable({
          type: "object",
          properties: {
            amount: { type: "integer" },
            unit: { type: "string", enum: ["days", "months"] },
          },
          required: ["amount", "unit"],
          additionalProperties: false,
        }),
      },
      required: ["type", "anchor", "amount", "unit", "condonable"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["statutory"] },
        ruleKey: { type: "string" },
        period: { type: "string" },
      },
      required: ["type", "ruleKey", "period"],
      additionalProperties: false,
    },
    { type: "null" },
  ],
};

/** JSON schema for structured outputs (both providers). Kept stable: it is part of the cached prefix. */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: FindingKind.options },
          text: { type: "string" },
          textEn: nullable({ type: "string" }),
          quote: { type: "string" },
          quoteLang: { type: "string" },
          pageHint: nullable({ type: "integer" }),
          confidence: { type: "number" },
          dueRule: dateRuleJsonSchema,
          amountMinor: nullable({ type: "integer" }),
          desk: nullable({ type: "string" }),
          severity: nullable({ type: "string", enum: ["low", "medium", "high"] }),
        },
        required: [
          "kind",
          "text",
          "textEn",
          "quote",
          "quoteLang",
          "pageHint",
          "confidence",
          "dueRule",
          "amountMinor",
          "desk",
          "severity",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["findings"],
  additionalProperties: false,
} as const;

// ------------------------------------------------------------ Zod (the real check)

const NullableDateRule = z.preprocess((v) => {
  // Drop `condonable: null` so the contract's DateRule (optional, not nullable) accepts it.
  if (v && typeof v === "object" && (v as { condonable?: unknown }).condonable === null) {
    const { condonable: _drop, ...rest } = v as Record<string, unknown>;
    return rest;
  }
  return v;
}, DateRule.nullable());

/** One finding as the model returns it. Strict: an unknown key rejects the finding. */
export const RawAiFinding = z.strictObject({
  kind: FindingKind,
  text: z.string().min(1).max(2000),
  textEn: z.string().max(2000).nullable(),
  quote: z.string().min(3).max(1500),
  quoteLang: z.string().min(2).max(16),
  pageHint: z.number().int().positive().nullable(),
  confidence: z.number().min(0).max(1),
  dueRule: NullableDateRule,
  amountMinor: z.number().int().nonnegative().nullable(),
  desk: z.string().max(200).nullable(),
  severity: z.enum(["low", "medium", "high"]).nullable(),
});
export type RawAiFinding = z.infer<typeof RawAiFinding>;

export const RawExtraction = z.strictObject({ findings: z.array(z.unknown()).max(200) });

export type RejectReason =
  | "malformed"
  | "date_field_outside_rule"
  | "page_out_of_range"
  | "empty_quote";

export type Issue = "fixed_date_not_in_quote" | "amount_not_in_quote" | "date_in_text_not_in_quote";

export interface AiFinding {
  /** Stable within one call: "ai-<level>-<index>". */
  id: string;
  finding: EngineFinding;
  /** Fields this check removed or replaced, for the run's notes. */
  issues: Issue[];
}

export interface ValidationResult {
  /** False when the whole output is unusable (not JSON, not the top-level shape). */
  ok: boolean;
  findings: AiFinding[];
  rejected: { index: number; reasons: RejectReason[] }[];
}

// ------------------------------------------------------------ helpers

const DATE_KEY = /(date|dueon|due_on|deadline|day|when)/i;

/** Paths of date-like keys anywhere except `dueRule` (where a DateRule may hold one). */
export function dateFieldsOutsideRule(value: unknown, path = ""): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value))
    return value.flatMap((v, i) => dateFieldsOutsideRule(v, `${path}[${i}]`));
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "dueRule") continue;
    const p = path ? `${path}.${k}` : k;
    if (DATE_KEY.test(k)) out.push(p);
    out.push(...dateFieldsOutsideRule(v, p));
  }
  return out;
}

/** Indic digit blocks (each ten consecutive code points) → ASCII. */
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

/** True when the quote writes the day of this ISO date as a standalone number. */
export function quoteHasDay(quote: string, iso: string): boolean {
  const day = Number(iso.slice(8, 10));
  if (!Number.isFinite(day)) return false;
  return new RegExp(`(?<!\\d)0?${day}(?!\\d)`).test(asciiDigits(quote));
}

const MULTIPLIERS: [RegExp, number][] = [
  [/^(crore|crores|cr)\b/i, 1e7],
  [/^(lakh|lakhs|lac|lacs)\b/i, 1e5],
  [/^(thousand)\b/i, 1e3],
];

/** Rupee amounts written in a quote, in minor units (paise). "Rs. 4,52,300" → 45230000; "2.5 lakh" → 25000000. */
export function amountsInQuote(quote: string): number[] {
  const text = asciiDigits(quote);
  const out: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const n = Number((m[1] ?? "").replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const rest = text.slice(re.lastIndex);
    let mult = 1;
    for (const [word, value] of MULTIPLIERS) if (word.test(rest)) mult = value;
    out.push(Math.round(n * mult * 100));
  }
  return out;
}

const ISO_IN_TEXT = /\b\d{4}-\d{2}-\d{2}\b/g;

// ------------------------------------------------------------ validate

export interface ValidateOptions {
  level: string;
  /** Pages in the document; a pageHint outside 1..pageCount rejects the finding. */
  pageCount?: number;
}

/** Parse a model's raw JSON text (or object) and keep only findings that pass every check. */
export function validateExtraction(raw: unknown, opts: ValidateOptions): ValidationResult {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, findings: [], rejected: [] };
    }
  }
  const top = RawExtraction.safeParse(value);
  if (!top.success) return { ok: false, findings: [], rejected: [] };

  const findings: AiFinding[] = [];
  const rejected: ValidationResult["rejected"] = [];
  top.data.findings.forEach((item, index) => {
    const reasons: RejectReason[] = [];
    if (dateFieldsOutsideRule(item).length > 0) reasons.push("date_field_outside_rule");
    const parsed = RawAiFinding.safeParse(item);
    if (!parsed.success) {
      if (!reasons.includes("date_field_outside_rule")) reasons.push("malformed");
      rejected.push({ index, reasons });
      return;
    }
    const f = parsed.data;
    if (!f.quote.trim()) reasons.push("empty_quote");
    if (f.pageHint !== null && opts.pageCount !== undefined && f.pageHint > opts.pageCount)
      reasons.push("page_out_of_range");
    if (reasons.length > 0) {
      rejected.push({ index, reasons });
      return;
    }

    const issues: Issue[] = [];
    const out: EngineFinding = {
      kind: f.kind,
      text: f.text,
      quote: f.quote,
      quoteLang: f.quoteLang,
      confidence: f.confidence,
    };
    if (f.textEn !== null) out.textEn = f.textEn;
    if (f.pageHint !== null) out.pageHint = f.pageHint;
    if (f.desk !== null) out.desk = f.desk;
    if (f.severity !== null) out.severity = f.severity;

    if (f.dueRule) {
      if (f.dueRule.type === "fixed" && !quoteHasDay(f.quote, f.dueRule.date)) {
        issues.push("fixed_date_not_in_quote");
      } else {
        out.dueRule = f.dueRule;
      }
    }
    if (f.amountMinor !== null) {
      if (amountsInQuote(f.quote).includes(f.amountMinor)) out.amountMinor = f.amountMinor;
      else issues.push("amount_not_in_quote");
    }
    for (const field of ["text", "textEn"] as const) {
      const v = out[field];
      if (v === undefined) continue;
      const isoDates = v.match(ISO_IN_TEXT) ?? [];
      if (isoDates.some((d) => !f.quote.includes(d))) {
        issues.push("date_in_text_not_in_quote");
        if (field === "text") out.text = f.quote;
        else delete out.textEn;
      }
    }
    findings.push({ id: `ai-${opts.level}-${index}`, finding: out, issues });
  });
  return { ok: true, findings, rejected };
}
