/**
 * A deterministic fake provider for tests and the eval's recorded mode.
 *
 * Answers, in order of preference:
 *  1. `script(req)` when given (tests that need a refusal, bad JSON, …);
 *  2. a recording keyed by `<level>/<caseKey>` (the eval);
 *  3. a small rule-based reader of the untrusted block for extraction, and
 *     simple deterministic answers for the other features.
 *
 * The built-in reader only ever looks at page text through
 * `parseUntrustedBlock`; it has no notion of instructions, so text in a
 * notice cannot change what it does (the injection tests rely on that).
 * Token counts are estimated at 4 characters a token; a repeated system
 * prompt on the same model counts as a cache read, like a real cache.
 */
import { parseUntrustedBlock } from "../untrusted";
import type { Provider, ProviderResult, StopKind, StructuredRequest } from "./types";

export interface FakeResponse {
  stop?: StopKind;
  /** Structured output; serialised to JSON text. */
  json?: unknown;
  /** Raw text instead of `json` (to test malformed output). */
  text?: string;
  servedModel?: string;
  usage?: Partial<ProviderResult["usage"]>;
  refusalCategory?: string | null;
}

export interface FakeProviderOptions {
  name?: string;
  serverFallbacks?: boolean;
  script?: (
    req: StructuredRequest,
    callIndex: number,
  ) => FakeResponse | undefined | Promise<FakeResponse | undefined>;
  /** `<level>/<caseKey>` → response. */
  recordings?: ReadonlyMap<string, FakeResponse> | Record<string, FakeResponse>;
  /** Throw this instead of answering (provider outage). */
  fail?: (req: StructuredRequest) => Error | undefined;
}

export interface FakeProvider extends Provider {
  readonly calls: StructuredRequest[];
}

const tokens = (s: string) => Math.ceil(s.length / 4);

export function createFakeProvider(options: FakeProviderOptions = {}): FakeProvider {
  const calls: StructuredRequest[] = [];
  const seenPrefixes = new Set<string>();
  const recordings =
    options.recordings instanceof Map
      ? options.recordings
      : new Map(Object.entries(options.recordings ?? {}));

  return {
    name: options.name ?? "fake",
    serverFallbacks: options.serverFallbacks ?? false,
    calls,
    async complete(req) {
      const index = calls.length;
      calls.push(req);
      const err = options.fail?.(req);
      if (err) throw err;
      const scripted = await options.script?.(req, index);
      const recorded = req.caseKey ? recordings.get(`${req.level}/${req.caseKey}`) : undefined;
      const r: FakeResponse = scripted ?? recorded ?? builtIn(req);
      const stop = r.stop ?? "end";
      const text = stop === "end" ? (r.text ?? JSON.stringify(r.json ?? {})) : null;

      const prefixKey = `${req.model}\u0000${req.system}`;
      const cached = seenPrefixes.has(prefixKey);
      seenPrefixes.add(prefixKey);
      const sys = tokens(req.system);
      const usage = {
        inputTokens: tokens(req.user),
        outputTokens: text ? tokens(text) : 0,
        cacheReadTokens: cached ? sys : 0,
        cacheWriteTokens: cached ? 0 : sys,
        ...r.usage,
      };
      return {
        stop,
        text,
        servedModel: r.servedModel ?? req.model,
        usage,
        refusalCategory: r.refusalCategory ?? null,
      };
    },
  };
}

// --------------------------------------------------------------- built-in answers

function builtIn(req: StructuredRequest): FakeResponse {
  switch (req.feature) {
    case "extract":
      return { json: { findings: readFindings(req.user) } };
    case "summary": {
      const ids = [...req.user.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1] as string);
      return {
        json: {
          bullets: ids.slice(0, 5).map((id) => ({ text: `See finding ${id}.`, cites: [id] })),
        },
      };
    }
    case "answer": {
      const ids = [...req.user.matchAll(/<passage id="([^"]+)">/g)].map((m) => m[1] as string);
      return {
        json: ids.length
          ? { answer: "See the cited passages.", cites: [ids[0]] }
          : { answer: "", cites: [] },
      };
    }
    case "draft_reply":
      return { json: { subject: "Reply to notice", body: "[Draft body]" } };
    case "triage":
    case "client_match":
      return {
        json: { docRole: "notice", noticeType: null, languages: ["en"], identifiers: [] },
      };
  }
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  // Malayalam
  ജനുവരി: 1,
  ഫെബ്രുവരി: 2,
  മാർച്ച്: 3,
  ഏപ്രിൽ: 4,
  മേയ്: 5,
  ജൂൺ: 6,
  ജൂലൈ: 7,
  ഓഗസ്റ്റ്: 8,
  സെപ്റ്റംബർ: 9,
  ഒക്ടോബർ: 10,
  നവംബർ: 11,
  ഡിസംബർ: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function fixedDate(s: string): string | null {
  const en =
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i.exec(
      s,
    );
  if (en) return `${en[3]}-${pad(MONTHS[(en[2] ?? "").toLowerCase()] ?? 0)}-${pad(Number(en[1]))}`;
  const ml = /(\d{4})\s+(\S+)\s+(\d{1,2})/.exec(s);
  if (ml) {
    const month = MONTHS[ml[2] ?? ""];
    if (month) return `${ml[1]}-${pad(month)}-${pad(Number(ml[3]))}`;
  }
  return null;
}

function relativeRule(s: string) {
  const m =
    /within\s+(\d+)\s+(working\s+)?(days?|months?)\s+(?:of|from)\s+(?:the\s+)?(receipt|date of (?:this )?(?:notice|invoice)|issue|service|communication|order)/i.exec(
      s,
    );
  if (!m) return null;
  const what = (m[4] ?? "").toLowerCase();
  const anchor = what.startsWith("receipt")
    ? "receipt"
    : what.startsWith("service") || what.startsWith("communication")
      ? "service"
      : what === "order"
        ? "order"
        : "issue";
  const unit = (m[3] ?? "").toLowerCase().startsWith("month")
    ? "months"
    : m[2]
      ? "working_days"
      : "days";
  return { type: "relative", anchor, amount: Number(m[1]), unit, condonable: null };
}

const DUTY =
  /\b(shall|must|directed to|required to|is due|responsible for|hearing is fixed)\b|(ണം|ണ്ടതാണ്)[.]?$/i;

/** A tiny, literal reader: one finding per sentence that states a duty. */
function readFindings(user: string) {
  const out: unknown[] = [];
  for (const page of parseUntrustedBlock(user)) {
    const sentences = page.text
      // A line that continues the previous sentence (starts in lower case or a digit) is joined to it.
      .replace(/\n(?=[a-z0-9(])/g, " ")
      .split(/\n+/)
      .flatMap((line) => line.split(/(?<=[.])\s+(?=[A-Zഀ-ൿ])/))
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sentence of sentences) {
      if (!DUTY.test(sentence)) continue;
      const fixed = fixedDate(sentence);
      const rel = relativeRule(sentence);
      const dueRule = fixed ? { type: "fixed", date: fixed } : rel;
      const amount = /Rs\.?\s*([\d,]+)/.exec(sentence);
      const isMl = /[ഀ-ൿ]/.test(sentence);
      out.push({
        kind: /hearing/i.test(sentence) ? "hearing" : dueRule ? "deadline" : "obligation",
        text: sentence.slice(0, 200),
        textEn: isMl ? "[translation]" : null,
        quote: sentence,
        quoteLang: isMl ? "ml" : "en",
        pageHint: page.page,
        confidence: 0.8,
        dueRule,
        amountMinor: amount ? Number((amount[1] ?? "").replace(/,/g, "")) * 100 : null,
        desk: null,
        severity: dueRule ? "high" : "medium",
      });
    }
  }
  return out;
}
