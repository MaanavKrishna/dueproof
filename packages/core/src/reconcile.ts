/**
 * Deterministic reconciliation of rule findings and AI findings (04 §4).
 * Code, not a model; same input, same output.
 *
 *   both agree, located        → origin rule+ai, verified
 *   rule only                  → origin rule, verified (needs review if unlocated)
 *   AI only, located           → origin ai, verified; its date may be `auto` only
 *                                as set out below
 *   AI only, not located       → unverified suggestion; never a deadline
 *   conflict (dates / amounts) → needs review, both values kept
 *
 * "Located" means the linker found the quote on the page (grade other than
 * `unlocated`). A finding without a located quote never becomes a deadline
 * until a person confirms it (house rule 3).
 *
 * Whose evidence proves the date. A merged pair's date is judged on the
 * evidence of the side that supplied it, never on the better grade of the
 * pair (that let a loosely similar AI quote "locate" a rule date whose own
 * quote was never found):
 *
 *   both sides carry the same rule → `agreed`; proved by the rule's quote,
 *                                    or by the AI's quote when that one is
 *                                    trustworthy (below) and the rule's is not exact
 *   only the rule carries it       → `rule_date`; the rule's own grade decides
 *   only the AI carries it         → `ai_date`; always reviewed. The rules read
 *                                    the same words and found no date there,
 *                                    so the date rests on the model alone.
 *
 * When an AI date may become a deadline without a person (house rules 2, 3).
 * All of these must hold; otherwise the finding is reviewed, whatever the
 * organisation's history:
 *
 *   - the AI's quote is located `exact` (an approximate or strong match may
 *     differ from the page in exactly the digits that make the date);
 *   - the rule is fully written in that quote (`ruleDerivableFromQuote`: the
 *     whole date, or the amount, unit and anchor of the period);
 *   - it is not a `statutory` rule (a model's choice of rule key and period
 *     is a judgement, not a copy, so a person makes it);
 *   - the organisation is past its first N AI findings (`reviewFirstN`).
 *
 * Why the first-N rule stays, and why it is not enough on its own: before
 * this change an org's 26th AI finding became a deadline at any located
 * grade. Volume says nothing about whether *this* date is on the page, so
 * the per-finding checks above now come first; first N is only an extra
 * wait for a new organisation. Only findings that pass every per-finding
 * check count towards N, so reviews of weak findings cannot "earn" trust.
 * The counter still counts findings *shown* for review, not ones a person
 * confirmed unchanged; the caller should count only confirmations.
 *
 * Due rules are compared as rules, never by today's dates (M10): "30 days
 * from receipt" and "30 days from issue" disagree even when both anchors
 * are the same day now, because correcting the received date later would
 * pull them apart without anyone having seen the disagreement.
 *
 * Never throws: bad input degrades to "needs review" or "no date".
 */
import type { DateRule, engine, FindingKind, Origin, Verification } from "@dueproof/contracts";
import { resolveDate } from "./dates/engine";
import { type DateContext, isDateError } from "./dates/types";
import { ruleDerivableFromQuote } from "./reconcile-derive";

export * from "./reconcile-derive";

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
  | "conflict_amount"
  /** A matched pair where only the rule finding carries the date. */
  | "rule_date"
  /** A matched pair where only the AI finding carries the date: always reviewed. */
  | "ai_date"
  /** An AI date whose quote is located, but not `exact`. */
  | "ai_inexact"
  /** An AI date that is not fully written in its quote. */
  | "ai_underived"
  /** An AI statutory rule: a person chooses the rule and period. */
  | "ai_statutory";

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
  /**
   * Whose quote proves the date, when there is one: show that source's
   * evidence box, and no other. `grade` and `page` are that source's.
   */
  dateEvidence?: "rule" | "ai";
}

export interface ReconcileOptions {
  /** How many AI-only findings this organisation has already had reviewed. */
  aiReviewedSoFar?: number;
  /** The first N AI-only located findings per organisation need review. Default 25. */
  reviewFirstN?: number;
  /**
   * When given, a due conflict carries the dates both rules resolve to, for
   * the reviewer. Rules are still compared as rules: equal dates today are
   * not agreement.
   */
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
  if (typeof s !== "string") return "";
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

/**
 * Two due rules agree only when they are the same rule. Resolving both and
 * comparing dates is not enough: "30 days from receipt" and "30 days from
 * issue" give the same day while the two anchors are equal, and part when
 * one is corrected. The resolved dates, when known, go on the conflict so a
 * reviewer sees both.
 */
function compareDue(rule: DateRule, ai: DateRule, ctx: DateContext | undefined): Conflict | null {
  if (canonical(rule) === canonical(ai)) return null;
  if (ctx) {
    const r = resolveDate(rule, ctx);
    const a = resolveDate(ai, ctx);
    const out: Conflict = { field: "due", rule, ai };
    if (!isDateError(r)) out.ruleDueOn = r.dueOn;
    if (!isDateError(a)) out.aiDueOn = a.dueOn;
    return out;
  }
  return { field: "due", rule, ai };
}

/**
 * Why an AI date may not become a deadline without a person; empty when it
 * may (subject to first N). See the header.
 */
function aiDateProblems(a: GradedFinding): ReconcileReason[] {
  const rule = a.finding.dueRule;
  if (!rule) return [];
  const out: ReconcileReason[] = [];
  if (a.grade !== "exact") out.push("ai_inexact");
  if (rule.type === "statutory") out.push("ai_statutory");
  else if (!ruleDerivableFromQuote(rule, a.finding.quote)) out.push("ai_underived");
  return out;
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
        ...(hasDate ? { dateEvidence: "rule" as const } : {}),
      });
      return;
    }
    const a = aiFindings[ai] as GradedFinding;
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
    merged.confidence = Math.max(r.finding.confidence, a.finding.confidence);

    // Whose quote proves the date (see the header). Without a date, the pair
    // is as located as its better side.
    const dateFrom = rd && ad ? "both" : rd ? "rule" : ad ? "ai" : null;
    let evidence: "rule" | "ai" | null = null;
    let grade: Verification;
    if (dateFrom === null) {
      grade = bestGrade(r.grade, a.grade);
      if (merged.page === undefined && a.page !== undefined && located(a.grade))
        merged.page = a.page;
    } else {
      const aiTrusted = ad !== undefined && aiDateProblems(a).length === 0;
      evidence =
        dateFrom === "ai" ||
        (dateFrom === "both" && conflicts.length === 0 && aiTrusted && r.grade !== "exact")
          ? "ai"
          : "rule";
      const src = evidence === "ai" ? a : r;
      grade = src.grade;
      if (src.page !== undefined && located(src.grade)) merged.page = src.page;
      else delete merged.page;
    }

    const isLocated = located(grade);
    const reasons: ReconcileReason[] =
      dateFrom === "rule"
        ? ["rule_date"]
        : dateFrom === "ai"
          ? ["ai_date", ...aiDateProblems(a)]
          : ["agreed"];
    if (!isLocated) reasons.push("unlocated");
    for (const c of conflicts) reasons.push(c.field === "due" ? "conflict_due" : "conflict_amount");
    const review = !isLocated || conflicts.length > 0 || dateFrom === "ai";
    const out: ReconciledFinding = {
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
    };
    if (evidence) out.dateEvidence = evidence;
    findings.push(out);
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
    // A located AI date that fails a per-finding check is reviewed, whatever
    // the organisation's history, and does not count towards first N.
    const problems = aiDateProblems(a);
    if (problems.length > 0) {
      findings.push({
        ...base(a),
        id: a.id,
        grade: a.grade,
        origin: "ai",
        status: "needs_review",
        needsReview: true,
        deadline: "after_review",
        reasons: ["ai_only", ...problems],
        conflicts: [],
        aiSource: a,
        dateEvidence: "ai",
      });
      return;
    }
    const firstReview = reviewed < firstN;
    if (firstReview) {
      reviewed++;
      used++;
    }
    const out: ReconciledFinding = {
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
    };
    if (hasDate) out.dateEvidence = "ai";
    findings.push(out);
  });

  return { findings, aiFirstNUsed: used };
}
