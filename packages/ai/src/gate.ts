/**
 * The proof gate's AI side (04 §1, §4). The engine's linker decides whether a
 * quote is on the page; this module turns validated AI findings into the
 * linker's request and the linker's answer into `GradedFinding`s for
 * `reconcile()` in packages/core.
 */
import type { engine } from "@dueproof/contracts";
import type { GradedFinding } from "@dueproof/core";
import type { AiFinding } from "./schema";

type LinkResponse = engine.LinkResponse;

/** One quote for `POST /v1/link`. */
export interface LinkQuote {
  id: string;
  text: string;
  pageHint?: number;
}

export function linkQuotesFor(findings: readonly AiFinding[]): LinkQuote[] {
  return findings.map((f) => {
    const q: LinkQuote = { id: f.id, text: f.finding.quote };
    if (f.finding.pageHint !== undefined) q.pageHint = f.finding.pageHint;
    return q;
  });
}

/** Attach the linker's grade. A finding the linker did not answer for is `unlocated`. */
export function gradeFindings(findings: readonly AiFinding[], link: LinkResponse): GradedFinding[] {
  const byId = new Map(link.matches.map((m) => [m.id, m]));
  return findings.map((f) => {
    const m = byId.get(f.id);
    const g: GradedFinding = { id: f.id, finding: f.finding, grade: m?.grade ?? "unlocated" };
    if (m?.page !== undefined && m.grade !== "unlocated") g.page = m.page;
    return g;
  });
}

export interface GateResult {
  failed: boolean;
  located: number;
  total: number;
  /** Findings with a due rule or an amount whose quote was not found. */
  unlocatedKeyFindings: number;
}

/**
 * The gate fails for a whole call when a finding that would set a date or an
 * amount can't be located, or when fewer than `minLocatedRate` of the
 * findings are located. (Single unlocated findings are still kept: reconcile
 * shows them as unverified suggestions.)
 */
export function proofGate(graded: readonly GradedFinding[], minLocatedRate = 0.5): GateResult {
  const total = graded.length;
  const located = graded.filter((g) => g.grade !== "unlocated").length;
  const unlocatedKeyFindings = graded.filter(
    (g) =>
      g.grade === "unlocated" &&
      (g.finding.dueRule !== undefined || g.finding.amountMinor !== undefined),
  ).length;
  const failed = total > 0 && (unlocatedKeyFindings > 0 || located / total < minLocatedRate);
  return { failed, located, total, unlocatedKeyFindings };
}
