/**
 * The languages Dueproof reads beside English: the 22 scheduled Indian
 * languages, mirroring services/engine/dueproof_engine/languages.py (code,
 * English name, Unicode block of the script, and whether the engine image
 * can carry a Tesseract pack for scans). Pure, so the browser can use it.
 *
 * An organisation lists the languages its notices come in (Settings →
 * Profiles). Those hints go to the engine's OCR, so scanned notices are read
 * with the right Tesseract packs, and they decide which language claims a
 * script that several share (Hindi, Marathi and Nepali are all Devanagari).
 */

const DEVA = "ऀ-ॿ";
const BENG = "ঀ-৿";
const ARAB = "؀-ۿݐ-ݿ";

export interface IndianLanguage {
  code: string;
  label: string;
  /** Character class body for the script's Unicode block. */
  script: string;
  /** Tesseract has a pack for it, so scans can be read. */
  ocr: boolean;
}

const lang = (code: string, label: string, script: string, ocr: boolean): IndianLanguage => ({
  code,
  label,
  script,
  ocr,
});

/** In the engine's registry order: the first of a shared script claims it by default. */
export const LANGUAGES: readonly IndianLanguage[] = [
  lang("hi", "Hindi", DEVA, true),
  lang("bn", "Bengali", BENG, true),
  lang("mr", "Marathi", DEVA, true),
  lang("te", "Telugu", "ఀ-౿", true),
  lang("ta", "Tamil", "஀-௿", true),
  lang("gu", "Gujarati", "઀-૿", true),
  lang("ur", "Urdu", ARAB, true),
  lang("kn", "Kannada", "ಀ-೿", true),
  lang("or", "Odia", "଀-୿", true),
  lang("ml", "Malayalam", "ഀ-ൿ", true),
  lang("pa", "Punjabi", "਀-੿", true),
  lang("as", "Assamese", BENG, true),
  lang("mai", "Maithili", DEVA, false),
  lang("sat", "Santali", "᱐-᱿", false),
  lang("ks", "Kashmiri", ARAB, false),
  lang("ne", "Nepali", DEVA, true),
  lang("sd", "Sindhi", ARAB, true),
  lang("kok", "Konkani", DEVA, false),
  lang("doi", "Dogri", DEVA, false),
  lang("mni", "Manipuri", "ꯀ-꯿", false),
  lang("brx", "Bodo", DEVA, false),
  lang("sa", "Sanskrit", DEVA, true),
];

export const LANGUAGE_CODES: readonly string[] = LANGUAGES.map((l) => l.code);

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

/** Known codes only, in order, without repeats. */
export function knownLanguages(codes: readonly unknown[]): string[] {
  return [...new Set(codes.filter((c): c is string => typeof c === "string" && BY_CODE.has(c)))];
}

/**
 * The hints for the engine's OCR: the organisation's languages, then any
 * already detected on the document, then English (always read).
 */
export function ocrLanguages(...lists: readonly (readonly string[])[]): string[] {
  return [...knownLanguages(lists.flat()), "en"];
}

/** One language per script: the first preferred code claims it, then registry order. */
function scriptTable(preferred: readonly string[]): Array<{ code: string; rx: RegExp }> {
  const order = [...knownLanguages(preferred), ...LANGUAGE_CODES];
  const claimed = new Set<string>();
  const out: Array<{ code: string; rx: RegExp }> = [];
  for (const code of order) {
    const l = BY_CODE.get(code);
    if (!l || claimed.has(l.script)) continue;
    claimed.add(l.script);
    out.push({ code, rx: new RegExp(`[${l.script}]`, "gu") });
  }
  return out;
}

const LATIN = /[A-Za-z]/g;

/**
 * Recognises languages line by line, by script. Returns a function giving
 * the line's language code, or "en" for a line in Latin script (or with too
 * little of any Indian script to tell: fewer than three characters, and
 * fewer than its Latin letters).
 */
export function lineLanguageDetector(preferred: readonly string[] = []) {
  const table = scriptTable(preferred);
  return (text: string): string => {
    let best: { code: string; n: number } | null = null;
    for (const { code, rx } of table) {
      const n = text.match(rx)?.length ?? 0;
      if (n > 0 && (!best || n > best.n)) best = { code, n };
    }
    if (!best) return "en";
    const latin = text.match(LATIN)?.length ?? 0;
    return best.n >= 3 || best.n >= latin ? best.code : "en";
  };
}
