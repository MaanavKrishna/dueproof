/**
 * Deterministic reconciliation of rule findings and AI findings (04 §4).
 * Code, not a model; same input, same output.
 *
 *   both agree, located        → origin rule+ai, verified
 *   rule only                  → origin rule, verified (needs review if unlocated)
 *   AI only, located           → origin ai, verified; the first N per org need review
 *   AI only, not located       → unverified suggestion; never a deadline
 *   conflict (dates / amounts) → needs review, both values kept
 *
 * "Located" means the linker found the quote on the page (grade other than
 * `unlocated`). A finding without a located quote never becomes a deadline
 * until a person confirms it (AGENTS rule 3).
 */
import type { DateRule, engine, FindingKind, Origin, Verification } from "@dueproof/contracts";
import { resolveDate } from "./dates/engine";
import { type DateContext, isDateError } from "./dates/types";

type EngineFinding = engine.EngineFinding;

/** A finding (rule or AI, same shape) with the linker's grade. */
export interface GradedFinding {
  id: string;
  finding: EngineFinding;
  grade: Verification;
  /** Page the linker located the quote on. */
  page?: number;
}

export type ReconcileStatus = "verified" | "needs_review" | "unverified";

/**
 * What may happen with the finding's date:
 * `auto` — becomes a deadline; `after_review` — proposed, waits for a person;
 * `never` — shown as a suggestion only; `none` — the finding has no date.
 */
export type DeadlinePolicy = "auto" | "after_review" | "never" | "none";

export type ReconcileReason =
  | "agreed"
  | "rule_only"
  | "ai_only"
  | "ai_first_n"
  | "unlocated"
  | "conflict_due"
  | "conflict_amount";

export type Conflict =
  | { field: "due"; rule: DateRule; ai: DateRule; ruleDueOn?: string; aiDueOn?: string }
  | { field: "amount"; rule: number; ai: number };

export interface ReconciledFinding {
  /** The rule finding's id when there is one, else the AI finding's. */
  id: string;
  kind: FindingKind;
  text: string;
  textEn?: string;
  quote: string;
  quoteLang: string;
  page?: number;
  grade: Verification;
  origin: Origin;
  status: ReconcileStatus;
  needsReview: boolean;
  deadline: DeadlinePolicy;
  reasons: ReconcileReason[];
  dueRule?: DateRule;
  amountMinor?: number;
  confidence: number;
  conflicts: Conflict[];
  ruleSource?: GradedFinding;
  aiSource?: GradedFinding;
}

export interface ReconcileOptions {
  /** How many AI-only findings this organisation has already had reviewed. */
  aiReviewedSoFar?: number;
  /** The first N AI-only located findings per organisation need review. Default 25. */
  reviewFirstN?: number;
  /** When given, due rules are compared by the dates they resolve to, not only their shape. */
  dateContext?: DateContext;
  /** Minimum quote similarity (0–1) for a rule and an AI finding to be the same. Default 0.5. */
  matchThreshold?: number;
}

export interface ReconcileResult {
  findings: ReconciledFinding[];
  /** AI-only findings flagged "first N" in this run: add to the organisation's counter. */
  aiFirstNUsed: number;
}

// ------------------------------------------------------------------ matching

const GRADE_ORDER: Verification[] = ["exact", "strong", "approximate", "unlocated"];

function bestGrade(a: Verification, b: Verification): Verification {
  return GRADE_ORDER.indexOf(a) <= GRADE_ORDER.indexOf(b) ? a : b;
}

const located = (g: Verification) => g !== "unlocated";

/** Kinds that can describe the same thing. */
function kindGroup(k: FindingKind): string {
  return k === "deadline" || k === "obligation" ? "duty" : k;
}

/** Kinds whose value is short and compared as a whole. */
const VALUE_KINDS = new Set<FindingKind>(["reference", "section", "office", "amount"]);

export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();
}

/** 0–1 similarity of two quotes: containment counts as 1, otherwise token Jaccard. */
export function quoteSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const shorter = ta.size <= tb.size ? na : nb;
  const longer = shorter === na ? nb : na;
  if (Math.min(ta.size, tb.size) >= 3 && ` ${longer} `.includes(` ${shorter} `)) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function matchScore(r: GradedFinding, a: GradedFinding): number {
  if (kindGroup(r.finding.kind) !== kindGroup(a.finding.kind)) return 0;
  const quote = quoteSimilarity(r.finding.quote, a.finding.quote);
  if (VALUE_KINDS.has(r.finding.kind)) {
    const sameValue = normalizeText(r.finding.text) === normalizeText(a.finding.text);
    const sameAmount =
      r.finding.amountMinor !== undefined && r.finding.amountMinor === a.finding.amountMinor;
    if (sameValue || sameAmount) return Math.max(quote, 0.9);
  }
  return quote;
}

// ---------------------------------------------------------------- comparing

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
}

function compareDue(rule: DateRule, ai: DateRule, ctx: DateContext | undefined): Conflict | null {
  if (canonical(rule) === canonical(ai)) return null;
  if (ctx) {
    const r = resolveDate(rule, ctx);
    const a = resolveDate(ai, ctx);
    if (!isDateError(r) && !isDateError(a)) {
      if (r.dueOn === a.dueOn && r.windowEndOn === a.windowEndOn) return null;
      return { field: "due", rule, ai, ruleDueOn: r.dueOn, aiDueOn: a.dueOn };
    }
  }
  return { field: "due", rule, ai };
}

// ---------------------------------------------------------------- reconcile

function base(g: GradedFinding) {
  const f = g.finding;
  const out = {
    kind: f.kind,
    text: f.text,
    quote: f.quote,
    quoteLang: f.quoteLang,
    confidence: f.confidence,
  } as Pick<ReconciledFinding, "kind" | "text" | "quote" | "quoteLang" | "confidence"> &
    Partial<ReconciledFinding>;
  if (f.textEn !== undefined) out.textEn = f.textEn;
  if (g.page !== undefined) out.page = g.page;
  if (f.dueRule !== undefined) out.dueRule = f.dueRule;
  if (f.amountMinor !== undefined) out.amountMinor = f.amountMinor;
  return out;
}

export function reconcile(
  ruleFindings: readonly GradedFinding[],
  aiFindings: readonly GradedFinding[],
  options: ReconcileOptions = {},
): ReconcileResult {
  const threshold = options.matchThreshold ?? 0.5;
  const firstN = options.reviewFirstN ?? 25;
  let reviewed = options.aiReviewedSoFar ?? 0;
  let used = 0;

  // Greedy best-first pairing; ties broken by input order, so the result is stable.
  const pairs: { r: number; a: number; score: number }[] = [];
  ruleFindings.forEach((r, ri) => {
    aiFindings.forEach((a, ai) => {
      const score = matchScore(r, a);
      if (score >= threshold) pairs.push({ r: ri, a: ai, score });
    });
  });
  pairs.sort((x, y) => y.score - x.score || x.r - y.r || x.a - y.a);
  const ruleToAi = new Map<number, number>();
  const aiTaken = new Set<number>();
  for (const p of pairs) {
    if (ruleToAi.has(p.r) || aiTaken.has(p.a)) continue;
    ruleToAi.set(p.r, p.a);
    aiTaken.add(p.a);
  }

  const findings: ReconciledFinding[] = [];

  ruleFindings.forEach((r, ri) => {
    const ai = ruleToAi.get(ri);
    if (ai === undefined) {
      const isLocated = located(r.grade);
      const hasDate = r.finding.dueRule !== undefined;
      findings.push({
        ...base(r),
        id: r.id,
        grade: r.grade,
        origin: "rule",
        status: isLocated ? "verified" : "needs_review",
        needsReview: !isLocated,
        deadline: !hasDate ? "none" : isLocated ? "auto" : "after_review",
        reasons: isLocated ? ["rule_only"] : ["rule_only", "unlocated"],
        conflicts: [],
        ruleSource: r,
      });
      return;
    }
    const a = aiFindings[ai] as GradedFinding;
    const grade = bestGrade(r.grade, a.grade);
    const conflicts: Conflict[] = [];
    const rd = r.finding.dueRule;
    const ad = a.finding.dueRule;
    if (rd && ad) {
      const c = compareDue(rd, ad, options.dateContext);
      if (c) conflicts.push(c);
    }
    const ram = r.finding.amountMinor;
    const aam = a.finding.amountMinor;
    if (ram !== undefined && aam !== undefined && ram !== aam) {
      conflicts.push({ field: "amount", rule: ram, ai: aam });
    }
    const merged = base(r);
    // Fill gaps from the AI side; never overwrite what the rules found.
    if (merged.dueRule === undefined && ad !== undefined) merged.dueRule = ad;
    if (merged.amountMinor === undefined && aam !== undefined) merged.amountMinor = aam;
    if (merged.textEn === undefined && a.finding.textEn !== undefined)
      merged.textEn = a.finding.textEn;
    if (merged.page === undefined && a.page !== undefined && located(a.grade)) merged.page = a.page;
    merged.confidence = Math.max(r.finding.confidence, a.finding.confidence);
    const isLocated = located(grade);
    const reasons: ReconcileReason[] = ["agreed"];
    if (!isLocated) reasons.push("unlocated");
    for (const c of conflicts) reasons.push(c.field === "due" ? "conflict_due" : "conflict_amount");
    const review = !isLocated || conflicts.length > 0;
    findings.push({
      ...merged,
      id: r.id,
      grade,
      origin: "rule+ai",
      status: review ? "needs_review" : "verified",
      needsReview: review,
      deadline: merged.dueRule === undefined ? "none" : review ? "after_review" : "auto",
      reasons,
      conflicts,
      ruleSource: r,
      aiSource: a,
    });
  });

  aiFindings.forEach((a, ai) => {
    if (aiTaken.has(ai)) return;
    const hasDate = a.finding.dueRule !== undefined;
    if (!located(a.grade)) {
      findings.push({
        ...base(a),
        id: a.id,
        grade: a.grade,
        origin: "ai",
        status: "unverified",
        needsReview: false,
        deadline: hasDate ? "never" : "none",
        reasons: ["ai_only", "unlocated"],
        conflicts: [],
        aiSource: a,
      });
      return;
    }
    const firstReview = reviewed < firstN;
    if (firstReview) {
      reviewed++;
      used++;
    }
    findings.push({
      ...base(a),
      id: a.id,
      grade: a.grade,
      origin: "ai",
      status: "verified",
      needsReview: firstReview,
      deadline: !hasDate ? "none" : firstReview ? "after_review" : "auto",
      reasons: firstReview ? ["ai_only", "ai_first_n"] : ["ai_only"],
      conflicts: [],
      aiSource: a,
    });
  });

  return { findings, aiFirstNUsed: used };
}
