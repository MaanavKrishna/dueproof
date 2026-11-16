/**
 * Which model runs, decided by deterministic code (04 §6), never by a model.
 *
 *   none     the engine's analyze says `confident: true` (or AI is off)
 *   haiku    clean digital notices, once its extraction eval passes (policy.haikuExtraction)
 *   sonnet   scans, photos, regional languages, unusual notices — the default
 *   opus     only by escalation, one step from sonnet: date/amount conflict with
 *            the rules, proof gate failed twice, or an order longer than N pages;
 *            capped per org (policy.opusCapPercent)
 *
 * Non-extraction features have fixed levels: triage, client match and
 * summaries on haiku; Ask and reply drafts on sonnet.
 */
import type { DocumentRole, engine } from "@dueproof/contracts";
import type { AiPolicy } from "./policy";
import { type EscalationReason, type Feature, LEVELS, type Level } from "./types";

export interface RouteSignals {
  /** `AnalyzeResponse.confident` from the engine. */
  rulesConfident: boolean;
  /** Pages as read by the engine (engine used, OCR confidence, languages). */
  pages: readonly Pick<engine.PageText, "engine" | "confidence" | "languages">[];
  docRole?: DocumentRole;
  /** `AnalyzeResponse.docType`; unknown when absent. */
  docType?: string;
}

export type RouteReason =
  | "ai_off"
  | "rules_confident"
  | "clean_digital"
  | "clean_digital_haiku_not_enabled"
  | "scan_or_photo"
  | "regional_language"
  | "unusual_notice";

export interface RouteDecision {
  level: Level | null;
  reasons: RouteReason[];
  /** Escalate to opus after sonnet because the order is long (04 §6). */
  longOrder: boolean;
}

const LONG_ORDER_TYPE = /(order|judgment|judgement|award|appellate)/i;

export function decideRoute(signals: RouteSignals, policy: AiPolicy): RouteDecision {
  if (policy.mode === "off" || !policy.provider) {
    return { level: null, reasons: ["ai_off"], longOrder: false };
  }
  if (signals.rulesConfident)
    return { level: null, reasons: ["rules_confident"], longOrder: false };

  const reasons: RouteReason[] = [];
  const scanned =
    signals.pages.length === 0 ||
    signals.pages.some((p) => p.engine !== "text_layer" || p.confidence < policy.ocrConfidenceBar);
  const regional = signals.pages.some((p) => p.languages.some((l) => !/^en\b/i.test(l)));
  const unusual = !signals.docType;
  if (scanned) reasons.push("scan_or_photo");
  if (regional) reasons.push("regional_language");
  if (unusual) reasons.push("unusual_notice");

  const isOrder =
    signals.docRole === "order" ||
    signals.docRole === "appeal" ||
    (signals.docType !== undefined && LONG_ORDER_TYPE.test(signals.docType));
  const longOrder = isOrder && signals.pages.length > policy.longOrderPages;

  if (reasons.length === 0) {
    if (policy.haikuExtraction) return { level: "haiku", reasons: ["clean_digital"], longOrder };
    return { level: "sonnet", reasons: ["clean_digital_haiku_not_enabled"], longOrder };
  }
  return { level: "sonnet", reasons, longOrder };
}

/** Fixed levels for the other features. */
export function levelForFeature(feature: Exclude<Feature, "extract">): Level {
  switch (feature) {
    case "summary":
    case "triage":
    case "client_match":
      return "haiku";
    case "answer":
    case "draft_reply":
      return "sonnet";
  }
}

/** One step up, never two. Null at the top. */
export function nextLevel(level: Level): Level | null {
  const i = LEVELS.indexOf(level);
  return LEVELS[i + 1] ?? null;
}

/** What to do after an extraction attempt. Pure; extract.ts carries it out. */
export type AttemptVerdict =
  | { action: "accept" }
  | { action: "retry"; reason: EscalationReason }
  | { action: "escalate"; to: Level; reason: EscalationReason }
  | { action: "stop"; reason: EscalationReason | "provider_error" };

export interface AttemptFacts {
  level: Level;
  outcome: "ok" | "refusal" | "max_tokens" | "schema_invalid" | "provider_error";
  /** Has this level already been retried for max_tokens / gate? */
  retriedHere: boolean;
  /** Proof-gate failures so far in this run, including this attempt. */
  gateFailures: number;
  gateFailed: boolean;
  dateConflict: boolean;
  amountConflict: boolean;
  longOrder: boolean;
  /** Provider steps up on refusal itself (Anthropic server-side fallbacks). */
  serverFallbacks: boolean;
}

/**
 * The escalation table (04 §6):
 *  - refusal: Haiku has no server-side fallback, so step up; Sonnet/Opus
 *    refusals without a server fallback step up once (sonnet→opus) too;
 *    otherwise stop (rules-only, flagged for review).
 *  - max_tokens: retry once on the same level, then step up.
 *  - schema_invalid: step up.
 *  - proof gate: haiku → sonnet; sonnet retries once; the second failure → opus.
 *  - date/amount conflict with the rules: step up.
 *  - long order: sonnet → opus.
 */
export function judgeAttempt(f: AttemptFacts): AttemptVerdict {
  const up = nextLevel(f.level);
  const escalate = (reason: EscalationReason): AttemptVerdict =>
    up ? { action: "escalate", to: up, reason } : { action: "stop", reason };

  switch (f.outcome) {
    case "provider_error":
      return { action: "stop", reason: "provider_error" };
    case "refusal":
      if (f.level === "haiku" || !f.serverFallbacks) return escalate("refusal");
      return { action: "stop", reason: "refusal" };
    case "max_tokens":
      return f.retriedHere ? escalate("max_tokens") : { action: "retry", reason: "max_tokens" };
    case "schema_invalid":
      return escalate("schema_invalid");
    case "ok":
      break;
  }
  if (f.gateFailed) {
    if (f.gateFailures >= 2) return escalate("proof_gate_failed_twice");
    if (f.level === "haiku") return escalate("proof_gate_failed");
    return { action: "retry", reason: "proof_gate_failed" };
  }
  if (f.dateConflict) return escalate("date_conflict");
  if (f.amountConflict) return escalate("amount_conflict");
  if (f.longOrder && f.level === "sonnet") return escalate("long_order");
  return { action: "accept" };
}
