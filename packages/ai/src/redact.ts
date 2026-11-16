/**
 * Optional PII redaction before text leaves the deployment (04 §7, 05 §9):
 * PAN, Aadhaar and bank account numbers become placeholders like ⟦PAN_1⟧.
 * The mapping stays in memory for the call; model output is restored with
 * `restore()` so quotes can be located on the original page and shown.
 *
 * Patterns are deliberately narrow; a missed number is sent as is, which is
 * the same as redaction being off. Never log the mapping.
 */

export type PiiKind = "PAN" | "AADHAAR" | "BANK";

export interface Redaction {
  text: string;
  /** placeholder → original */
  mapping: Map<string, string>;
  counts: Record<PiiKind, number>;
}

/** PAN: 5 letters, 4 digits, 1 letter; the fourth letter is the holder type. Also matches inside a GSTIN. */
const PAN = /(?<![A-Z])[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z](?![A-Za-z])/g;
/** Aadhaar: 12 digits starting 2–9, optionally grouped 4-4-4. */
const AADHAAR = /(?<![\d])[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?![\d])/g;
/** Bank account: 9–18 digits after an account label. Only the number is replaced. */
const BANK = /((?:a\/c|acct|account)\.?\s*(?:no\.?|number|#)?\s*[:-]?\s*)(\d[\d ]{7,20}\d)/gi;

function placeholder(kind: PiiKind, n: number): string {
  return `⟦${kind}_${n}⟧`;
}

export interface Redactor {
  redact(text: string): string;
  readonly mapping: Map<string, string>;
  readonly counts: Record<PiiKind, number>;
}

/** One redactor per call: the same number gets the same placeholder across pages. */
export function createRedactor(): Redactor {
  const mapping = new Map<string, string>();
  const reverse = new Map<string, string>();
  const counts: Record<PiiKind, number> = { PAN: 0, AADHAAR: 0, BANK: 0 };
  const token = (kind: PiiKind, original: string) => {
    const existing = reverse.get(`${kind}:${original}`);
    if (existing) return existing;
    counts[kind]++;
    const p = placeholder(kind, counts[kind]);
    mapping.set(p, original);
    reverse.set(`${kind}:${original}`, p);
    return p;
  };
  return {
    mapping,
    counts,
    redact(input: string): string {
      let text = input.replace(BANK, (_m, label: string, num: string) => {
        const digits = num.replace(/\s/g, "");
        if (digits.length < 9 || digits.length > 18) return `${label}${num}`;
        return `${label}${token("BANK", num)}`;
      });
      text = text.replace(AADHAAR, (m) => token("AADHAAR", m));
      text = text.replace(PAN, (m) => token("PAN", m));
      return text;
    },
  };
}

export function redact(input: string): Redaction {
  const r = createRedactor();
  const text = r.redact(input);
  return { text, mapping: r.mapping, counts: r.counts };
}

/** Put the originals back into model output (quotes, text). */
export function restore(text: string, mapping: ReadonlyMap<string, string>): string {
  if (mapping.size === 0) return text;
  return text.replace(/⟦(PAN|AADHAAR|BANK)_\d+⟧/g, (p) => mapping.get(p) ?? p);
}

/** Restore every string inside a JSON-like value. */
export function restoreDeep<T>(value: T, mapping: ReadonlyMap<string, string>): T {
  if (mapping.size === 0) return value;
  if (typeof value === "string") return restore(value, mapping) as T;
  if (Array.isArray(value)) return value.map((v) => restoreDeep(v, mapping)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = restoreDeep(v, mapping);
    return out as T;
  }
  return value;
}
