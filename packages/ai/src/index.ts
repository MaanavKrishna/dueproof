/**
 * @dueproof/ai — provider adapters, model routing, prompts and the AI side of
 * the proof gate (design record 04). Server-only.
 *
 * The workflow's `ai_assist` step calls `assistExtraction()`; its
 * `aiFindings` go to `reconcile()` in @dueproof/core and its `runs` to `ai_runs`.
 */
export { type CallContext, type CallResult, callProvider } from "./call";
export { costForModel, costMicroUsd, estimateMaxCostMicroUsd } from "./cost";
export {
  type AssistDeps,
  type AssistInput,
  type AssistResult,
  type AssistStatus,
  assistExtraction,
} from "./extract";
export {
  type Answer,
  answer,
  DRAFT_LABEL,
  type Draft,
  draftReply,
  type FeatureDeps,
  type FeatureResult,
  type Passage,
  type SummaryBullet,
  type SummaryFinding,
  summarise,
  type Triage,
  triage,
} from "./features";
export { type GateResult, gradeFindings, type LinkQuote, linkQuotesFor, proofGate } from "./gate";
export {
  decryptApiKey,
  type EncryptedKey,
  encryptApiKey,
  generateMasterKey,
  KeyError,
  loadMasterKey,
  maskKey,
  rewrapApiKey,
} from "./keys";
export {
  type AiPolicy,
  type AiSettingsRow,
  type AiUsage,
  budgetAlerts,
  DEFAULT_EFFORT,
  DEFAULT_MAX_OUTPUT_TOKENS,
  isClientExcluded,
  opusAllowed,
  type SkipReason,
  usdCentsToMicroUsd,
  withinBudget,
} from "./policy";
export { canonicalModelId, type ModelPrice, PRICES, priceFor } from "./prices";
export { type PromptId, promptIdFor, type SystemPrompt, systemPrompt } from "./prompts";
export * from "./providers";
export {
  createRedactor,
  type PiiKind,
  type Redaction,
  type Redactor,
  redact,
  restore,
  restoreDeep,
} from "./redact";
export {
  type AttemptFacts,
  type AttemptVerdict,
  decideRoute,
  judgeAttempt,
  levelForFeature,
  nextLevel,
  type RouteDecision,
  type RouteReason,
  type RouteSignals,
} from "./routing";
export {
  type AiFinding,
  amountsInQuote,
  asciiDigits,
  dateFieldsOutsideRule,
  EXTRACTION_JSON_SCHEMA,
  type Issue,
  RawAiFinding,
  type RejectReason,
  type ValidationResult,
  validateExtraction,
} from "./schema";
export { GATEWAY_MODELS, type PolicyOptions, policyFromSettings } from "./settings";
export * from "./types";
export { dataBlock, neutralise, parseUntrustedBlock, untrustedBlock } from "./untrusted";
