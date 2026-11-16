/**
 * Scoring (04 §8). A case is scored on what a user would see after
 * reconciliation: rule and AI findings merged by `reconcile()`, dates from the
 * date engine.
 *
 *   precision           matched predicted duties / predicted duties
 *   recall              labelled duties found / labelled duties
 *   deadline exact      labelled due dates matched exactly by the computed date
 *   amount exact        labelled amounts matched exactly
 *   located rate        AI findings whose quote the linker found
 *   confident-wrong     a finding that would become a deadline without review
 *                       (deadline "auto") whose date is wrong: it matches a
 *                       label with another date or none, matches a "not an
 *                       obligation" label, or matches nothing and its date is
 *                       no labelled date; or an amount trusted without review
 *                       that differs from the labelled amount. Must be 0.
 *
 * "Predicted duties" are reconciled findings of kind obligation, deadline or
 * hearing that are not unverified suggestions.
 */
import type { AiRunRecord } from "../../packages/ai/src/index";
import {
  type GradedFinding,
  quoteSimilarity,
  type ReconciledFinding,
  reconcile,
  resolveDate,
} from "../../packages/core/src/index";
import type { EvalCase } from "./cases";

const DUTY_KINDS = new Set(["obligation", "deadline", "hearing"]);
const MATCH = 0.5;

export interface ConfidentWrong {
  quote: string;
  why: "wrong_date" | "date_for_undated_duty" | "not_an_obligation" | "invented_date" | "wrong_amount";
  computed?: string;
  expected?: string;
}

export interface CaseScore {
  key: string;
  tags: string[];
  labels: number;
  found: number;
  predicted: number;
  predictedMatched: number;
  deadlineLabels: number;
  deadlineExact: number;
  amountLabels: number;
  amountExact: number;
  aiFindings: number;
  aiLocated: number;
  confidentWrong: ConfidentWrong[];
  calls: number;
  escalations: string[];
  costMicroUsd: number;
  latencyMs: number;
  needsReview: boolean;
}

function quotesOf(f: ReconciledFinding): string[] {
  const q = [f.quote];
  if (f.ruleSource) q.push(f.ruleSource.finding.quote);
  if (f.aiSource) q.push(f.aiSource.finding.quote);
  return q;
}

function sim(label: string, f: ReconciledFinding): number {
  return Math.max(...quotesOf(f).map((q) => quoteSimilarity(label, q)));
}

function computedDate(f: ReconciledFinding, c: EvalCase): string | undefined {
  if (!f.dueRule) return undefined;
  const r = resolveDate(f.dueRule, c.dateContext);
  return "dueOn" in r ? r.dueOn : undefined;
}

export function scoreCase(
  c: EvalCase,
  ai: { findings: GradedFinding[]; runs: AiRunRecord[]; needsReview: boolean } | null,
): CaseScore {
  const aiFindings = ai?.findings ?? [];
  const { findings } = reconcile(c.ruleFindings, aiFindings, {
    dateContext: c.dateContext,
    // Steady state: past the first-N review period, so AI-only located findings are trusted.
    aiReviewedSoFar: Number.MAX_SAFE_INTEGER,
  });
  const visible = findings.filter((f) => f.status !== "unverified");
  const duties = visible.filter((f) => DUTY_KINDS.has(f.kind));

  // Greedy one-to-one matching of labels to predicted duties.
  const pairs: { l: number; p: number; s: number }[] = [];
  c.obligations.forEach((label, l) => {
    duties.forEach((f, p) => {
      const s = sim(label.quote, f);
      if (s >= MATCH) pairs.push({ l, p, s });
    });
  });
  pairs.sort((a, b) => b.s - a.s || a.l - b.l || a.p - b.p);
  const labelToPred = new Map<number, number>();
  const predToLabel = new Map<number, number>();
  for (const x of pairs) {
    if (labelToPred.has(x.l) || predToLabel.has(x.p)) continue;
    labelToPred.set(x.l, x.p);
    predToLabel.set(x.p, x.l);
  }

  let deadlineLabels = 0;
  let deadlineExact = 0;
  c.obligations.forEach((label, l) => {
    if (!label.due_date) return;
    deadlineLabels++;
    const p = labelToPred.get(l);
    if (p !== undefined && computedDate(duties[p] as ReconciledFinding, c) === label.due_date)
      deadlineExact++;
  });

  const labelledDates = new Set(c.obligations.map((o) => o.due_date).filter(Boolean));
  const confidentWrong: ConfidentWrong[] = [];
  duties.forEach((f, p) => {
    if (f.deadline !== "auto") return;
    const date = computedDate(f, c);
    const l = predToLabel.get(p);
    const short = f.quote.slice(0, 80);
    if (l !== undefined) {
      const expected = c.obligations[l]?.due_date;
      if (!expected) confidentWrong.push({ quote: short, why: "date_for_undated_duty", ...(date ? { computed: date } : {}) });
      else if (date !== expected)
        confidentWrong.push({ quote: short, why: "wrong_date", expected, ...(date ? { computed: date } : {}) });
      return;
    }
    if (c.notObligations.some((q) => sim(q, f) >= MATCH)) {
      confidentWrong.push({ quote: short, why: "not_an_obligation", ...(date ? { computed: date } : {}) });
      return;
    }
    if (!date || !labelledDates.has(date))
      confidentWrong.push({ quote: short, why: "invented_date", ...(date ? { computed: date } : {}) });
  });

  let amountExact = 0;
  for (const a of c.amounts) {
    const candidates = visible.filter((f) => f.amountMinor !== undefined && sim(a.quote, f) >= MATCH);
    if (candidates.some((f) => f.amountMinor === a.minor)) amountExact++;
    for (const f of candidates)
      if (f.amountMinor !== a.minor && f.status === "verified" && !f.needsReview)
        confidentWrong.push({
          quote: f.quote.slice(0, 80),
          why: "wrong_amount",
          computed: String(f.amountMinor),
          expected: String(a.minor),
        });
  }

  const runs = ai?.runs ?? [];
  return {
    key: c.key,
    tags: c.tags,
    labels: c.obligations.length,
    found: labelToPred.size,
    predicted: duties.length,
    predictedMatched: predToLabel.size,
    deadlineLabels,
    deadlineExact,
    amountLabels: c.amounts.length,
    amountExact,
    aiFindings: aiFindings.length,
    aiLocated: aiFindings.filter((g) => g.grade !== "unlocated").length,
    confidentWrong,
    calls: runs.length,
    escalations: runs.map((r) => r.escalationReason).filter((r): r is NonNullable<typeof r> => !!r),
    costMicroUsd: runs.reduce((s, r) => s + r.costMicroUsd, 0),
    latencyMs: runs.reduce((s, r) => s + r.latencyMs, 0),
    needsReview: ai?.needsReview ?? false,
  };
}

export interface RouteSummary {
  route: string;
  cases: number;
  precision: number | null;
  recall: number | null;
  deadlineExact: number | null;
  amountExact: number | null;
  locatedRate: number | null;
  confidentWrong: number;
  confidentWrongRate: number;
  aiCalls: number;
  notices_with_ai: number;
  costMicroUsd: number;
  costPerNoticeMicroUsd: number;
  latencyMeanMs: number;
  latencyMaxMs: number;
  escalations: Record<string, number>;
  /** 04 §6: a route goes live only with 0 confident-wrong. */
  passes: boolean;
}

const ratio = (n: number, d: number) => (d === 0 ? null : n / d);

export function summarise(route: string, scores: readonly CaseScore[]): RouteSummary {
  const sum = (f: (s: CaseScore) => number) => scores.reduce((a, s) => a + f(s), 0);
  const predicted = sum((s) => s.predicted);
  const cw = sum((s) => s.confidentWrong.length);
  const escalations: Record<string, number> = {};
  for (const s of scores) for (const e of s.escalations) escalations[e] = (escalations[e] ?? 0) + 1;
  return {
    route,
    cases: scores.length,
    precision: ratio(sum((s) => s.predictedMatched), predicted),
    recall: ratio(sum((s) => s.found), sum((s) => s.labels)),
    deadlineExact: ratio(sum((s) => s.deadlineExact), sum((s) => s.deadlineLabels)),
    amountExact: ratio(sum((s) => s.amountExact), sum((s) => s.amountLabels)),
    locatedRate: ratio(sum((s) => s.aiLocated), sum((s) => s.aiFindings)),
    confidentWrong: cw,
    confidentWrongRate: predicted === 0 ? 0 : cw / predicted,
    aiCalls: sum((s) => s.calls),
    notices_with_ai: scores.filter((s) => s.calls > 0).length,
    costMicroUsd: sum((s) => s.costMicroUsd),
    costPerNoticeMicroUsd: scores.length ? sum((s) => s.costMicroUsd) / scores.length : 0,
    latencyMeanMs: scores.length ? sum((s) => s.latencyMs) / scores.length : 0,
    latencyMaxMs: Math.max(0, ...scores.map((s) => s.latencyMs)),
    escalations,
    passes: gate({ confidentWrong: cw }),
  };
}

/** The gate: a route passes only with zero confident-wrong findings. */
export function gate(m: { confidentWrong: number }): boolean {
  return m.confidentWrong === 0;
}
