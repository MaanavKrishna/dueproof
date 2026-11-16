/**
 * Thin adapter over @dueproof/core (lane L2), so the platform can run before
 * core lands. Swap point: when core exports these, delete the local
 * fallbacks below and re-export from "@dueproof/core".
 *
 * Core's shapes differ from these local ones (resolveDate returns
 * ResolvedDateDetail | DateError, checked with isDateError; reconcile takes
 * GradedFinding[] for rule and AI findings; can() takes core's subject), so
 * the swap is a small rewrite of this file, not an automatic switch.
 *
 * - resolveDate: a minimal local engine (fixed dates; N days / working days
 *   / months from an anchor). It does not move dates for holidays or apply
 *   statutory rules: that is core's job.
 * - reconcile: merges engine findings with link results and grades.
 * - can: role × action policy, deny by default.
 */
import type {
  Anchor,
  DateRule,
  IsoDate,
  ResolvedDate,
  Role,
  Verification,
} from "@dueproof/contracts";

export interface ResolveContext {
  anchors: Partial<Record<Anchor, IsoDate>>;
  holidays: IsoDate[];
  /** ISO weekdays that are working days: 1 = Monday … 7 = Sunday. */
  workingDays: number[];
  extensions?: unknown[];
}

export type ResolveResult = ResolvedDate | { error: string };

export function resolveDate(rule: DateRule, ctx: ResolveContext): ResolveResult {
  return localResolveDate(rule, ctx);
}

// ---------------------------------------------------------------- local date engine

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parse(d: IsoDate): Date {
  return new Date(`${d}T00:00:00Z`);
}
function iso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}
function words(d: IsoDate): string {
  const x = parse(d);
  return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
function addMonths(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
}
function isoWeekday(d: Date): number {
  return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
}

function localResolveDate(rule: DateRule, ctx: ResolveContext): ResolveResult {
  if (rule.type === "fixed") {
    return { dueOn: rule.date, rule, basis: `On ${words(rule.date)}`, adjustments: [] };
  }
  if (rule.type === "statutory") {
    return { error: `statutory rule ${rule.ruleKey} needs the statutory calendar (packages/core)` };
  }
  const anchor = ctx.anchors[rule.anchor];
  if (!anchor) return { error: `needs the ${rule.anchor} date` };
  const start = parse(anchor);
  let due: Date;
  if (rule.unit === "days") {
    due = addDays(start, rule.amount);
  } else if (rule.unit === "months") {
    due = addMonths(start, rule.amount);
  } else {
    const holidays = new Set(ctx.holidays);
    const working = new Set(ctx.workingDays.length ? ctx.workingDays : [1, 2, 3, 4, 5]);
    due = start;
    let left = rule.amount;
    while (left > 0) {
      due = addDays(due, 1);
      if (working.has(isoWeekday(due)) && !holidays.has(iso(due))) left -= 1;
    }
  }
  const unitWords = rule.unit === "working_days" ? "working days" : rule.unit;
  const result: ResolvedDate = {
    dueOn: iso(due),
    rule,
    basis: `${rule.amount} ${unitWords} from ${rule.anchor} on ${words(anchor)}`,
    adjustments: [],
  };
  if (rule.condonable) {
    const end =
      rule.condonable.unit === "days"
        ? addDays(due, rule.condonable.amount)
        : addMonths(due, rule.condonable.amount);
    result.windowEndOn = iso(end);
  }
  return result;
}

// ---------------------------------------------------------------- reconcile

export interface EngineFindingLike {
  kind: string;
  text: string;
  quote: string;
  confidence: number;
  pageHint?: number | undefined;
}

export interface LinkMatchLike {
  id: string;
  page?: number | undefined;
  rects: [number, number, number, number][];
  score: number;
  grade: Verification;
}

export interface Reconciled<F extends EngineFindingLike> {
  finding: F;
  verification: Verification;
  match: LinkMatchLike | undefined;
}

/**
 * Pair each finding with its proof, drop exact duplicates (same kind and
 * quote), and grade. A finding whose quote was not found is `unlocated`
 * (AGENTS rule 3).
 */
export function reconcile<F extends EngineFindingLike>(
  findings: F[],
  matches: LinkMatchLike[],
  idOf: (index: number) => string,
): Reconciled<F>[] {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const out: Reconciled<F>[] = [];
  findings.forEach((finding, i) => {
    const key = `${finding.kind}\u0000${finding.quote.trim().toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const match = byId.get(idOf(i));
    const located =
      match && match.grade !== "unlocated" && match.page !== undefined && match.rects.length > 0;
    out.push({
      finding,
      verification: located ? match.grade : "unlocated",
      match: located ? match : undefined,
    });
  });
  return out;
}

// ---------------------------------------------------------------- policy

export type Action =
  | "document.read"
  | "document.upload"
  | "document.delete"
  | "finding.edit"
  | "finding.confirm"
  | "case.read"
  | "case.edit"
  | "case.approve"
  | "deadline.edit"
  | "org.manage"
  | "audit.read";

export interface Subject {
  userId: string;
  role: Role;
  mayApproveReplies: boolean;
}

export interface Resource {
  /** For approvals: who asked. Approver must differ (05 §2). */
  requestedBy?: string | null;
}

const MATRIX: Record<Action, readonly Role[]> = {
  "document.read": ["owner", "admin", "manager", "member", "viewer"],
  "case.read": ["owner", "admin", "manager", "member", "viewer"],
  "document.upload": ["owner", "admin", "manager", "member"],
  "finding.edit": ["owner", "admin", "manager", "member"],
  "finding.confirm": ["owner", "admin", "manager", "member"],
  "case.edit": ["owner", "admin", "manager", "member"],
  "deadline.edit": ["owner", "admin", "manager", "member"],
  "document.delete": ["owner", "admin", "manager"],
  "case.approve": ["owner", "admin", "manager", "member"],
  "audit.read": ["owner", "admin"],
  "org.manage": ["owner", "admin"],
};

export function can(subject: Subject, action: Action, resource: Resource = {}): boolean {
  const allowed = MATRIX[action];
  if (!allowed?.includes(subject.role)) return false;
  if (action === "case.approve") {
    if (!subject.mayApproveReplies) return false;
    if (resource.requestedBy && resource.requestedBy === subject.userId) return false;
  }
  return true;
}
