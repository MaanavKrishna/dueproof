/**
 * Which findings wait for a person (01 §4 "Needs review queue", 03 §6). The
 * pipeline doesn't store core's `needsReview` flag, so it is derived from
 * what is stored, the same way for Today's count, the Inbox queue and the
 * case page:
 *
 * - open, and nobody has confirmed it yet, and
 * - not located on the page (house rule 3), or
 * - suggested by AI alone and not yet a deadline, or
 * - it carries a date rule that hasn't become a deadline (proposed date
 *   waiting for review, or the receipt date is missing).
 */
export type ReviewReason =
  | "unlocated"
  | "ai_only"
  | "proposed_date"
  | "low_confidence"
  | "conflict";

/** Below this, a located finding is still shown for a second look. */
export const CONFIDENCE_BAR = 0.6;

export interface ReviewFacts {
  status: string;
  confirmedBy: string | null;
  verification: string;
  origin: string;
  confidence: number;
  dueRule: unknown;
  kind: string;
  /** A deadline row already points at this finding. */
  hasDeadline: boolean;
  /** Rules and AI read it differently (findings.conflict). */
  conflict?: unknown;
}

/** Kinds that are context, not duties: they're never queued for review on their own. */
const CONTEXT_KINDS = new Set(["reference", "office", "section", "summary"]);

export function reviewReasons(f: ReviewFacts): ReviewReason[] {
  if (f.status !== "open" || f.confirmedBy) return [];
  const reasons: ReviewReason[] = [];
  if (f.conflict) reasons.push("conflict");
  if (f.verification === "unlocated" && !CONTEXT_KINDS.has(f.kind)) reasons.push("unlocated");
  if (f.origin === "ai" && !f.hasDeadline && !CONTEXT_KINDS.has(f.kind)) reasons.push("ai_only");
  if (f.dueRule && !f.hasDeadline) reasons.push("proposed_date");
  if (f.verification !== "unlocated" && f.confidence < CONFIDENCE_BAR && !CONTEXT_KINDS.has(f.kind))
    reasons.push("low_confidence");
  return reasons;
}

export function reviewReasonText(reasons: ReviewReason[]): string {
  const words: Record<ReviewReason, string> = {
    unlocated: "The quote wasn't found on the page",
    ai_only: "Suggested by AI and not yet checked by a person",
    proposed_date: "The date waits for a person to confirm it",
    low_confidence: "Read with low confidence",
    conflict: "The rules and AI read this differently: check both against the page",
  };
  return reasons.map((r) => words[r]).join(". ");
}
