/**
 * Model prices are DATA with a source, not code constants (house rule 10).
 * USD per million tokens. Every row is "verify" until checked against the
 * provider's price page at release time.
 *
 * Sources (checked 2026-11-16):
 *  - Anthropic list prices for Claude Haiku 5.5, Sonnet 5.5, Opus 5.5 (plan doc 04 §9).
 *  - Vercel AI Gateway public catalogue (anthropic/claude-*-5.5): same list
 *    prices, plus cache read/write and Haiku's long-context tier. Through the
 *    gateway, regional inference (us/eu/au/jp) costs about 10 % more; not modelled.
 *  - Cache reads are the provider's discount; cache writes are the 5-minute TTL price.
 */

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Prices above a prompt-size threshold (Haiku 5.5 above 100K input tokens). */
  longContext?: {
    aboveInputTokens: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  source: string;
  verify: true;
}

const ANTHROPIC = "Anthropic list price, Nov 2026; Vercel AI Gateway catalogue 2026-11-16";
const PREVIOUS = "Vercel AI Gateway catalogue 2026-11-16 (fallback models only)";

export const PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    longContext: {
      aboveInputTokens: 100_000,
      input: 0.5,
      output: 2.5,
      cacheRead: 0.05,
      cacheWrite: 0.625,
    },
    source: ANTHROPIC,
    verify: true,
  },
  "claude-sonnet-5-5": {
    input: 2,
    output: 10,
    cacheRead: 0.1,
    cacheWrite: 2.5,
    source: ANTHROPIC,
    verify: true,
  },
  "claude-opus-5-5": {
    input: 4,
    output: 20,
    cacheRead: 0.2,
    cacheWrite: 5,
    source: ANTHROPIC,
    verify: true,
  },
  // Models a server-side refusal fallback may hand a request to.
  "claude-sonnet-5": {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
    source: PREVIOUS,
    verify: true,
  },
  "claude-opus-5": {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite: 6.25,
    source: PREVIOUS,
    verify: true,
  },
  "claude-opus-4-8": {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite: 6.25,
    source: PREVIOUS,
    verify: true,
  },
};

/** Gateway ids ("anthropic/claude-sonnet-5.5") and dated/region variants map to the table's ids. */
export function canonicalModelId(model: string): string {
  let m = model.trim().toLowerCase();
  const slash = m.lastIndexOf("/");
  if (slash >= 0) m = m.slice(slash + 1);
  m = m.replace(/^anthropic\./, "");
  // "claude-sonnet-5.5" → "claude-sonnet-5-5"
  m = m.replace(/(\d)\.(\d)/g, "$1-$2");
  return m;
}

export function priceFor(model: string): ModelPrice | undefined {
  return PRICES[canonicalModelId(model)];
}

/**
 * What a call to a model with no price in the table is charged against the
 * budget: the highest price in the table for each kind of token (long-context
 * tiers included). Derived from the rows above, not a separate figure, so it
 * moves when they do. Erring high means a budget still stops spending on an
 * unpriced model (BYOK on another provider, a gateway alias); erring low, as
 * the old zero did, meant no budget at all. Local models are free and are
 * never charged this (see `costForModel`).
 */
export const UNKNOWN_MODEL_PRICE: ModelPrice = (() => {
  const rows = Object.values(PRICES).flatMap((p) => (p.longContext ? [p, p.longContext] : [p]));
  const max = (k: "input" | "output" | "cacheRead" | "cacheWrite") =>
    Math.max(...rows.map((r) => r[k]));
  return {
    input: max("input"),
    output: max("output"),
    cacheRead: max("cacheRead"),
    cacheWrite: max("cacheWrite"),
    source: "Highest price in this table, per token kind (models with no price of their own)",
    verify: true,
  };
})();
