/**
 * The deadline read model shared by Deadlines, Clients and Reports: one row
 * per due item with its client, case, owner and ladder rung. Runs inside the
 * caller's `withOrg` transaction. Never carries document text.
 */
import "server-only";
import { dueBucket } from "@dueproof/core";
import {
  and,
  asc,
  cases,
  clients,
  deadlines,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  type OrgTx,
  or,
} from "@dueproof/db";
import type { DeadlineDetail } from "./deadline-detail";

export type DeadlineSource = "notice" | "order" | "statutory" | "manual";
export type DeadlineStatus = "open" | "done" | "dismissed";
/** The UI's due ladder (DueChip). */
export type DueState = "overdue" | "today" | "week" | "later" | "done";
/** What kind of law the item comes from, for the "Type" filter. */
export type DeadlineType = "gst" | "income_tax" | "tds" | "roc" | "other";

export interface DeadlineRow {
  id: string;
  title: string;
  dueOn: string;
  /** End of the condonation window, shown separately. */
  windowEndOn: string | null;
  windowBasis: string | null;
  basis: string;
  source: DeadlineSource;
  type: DeadlineType;
  status: DeadlineStatus;
  state: DueState;
  ownerUserId: string | null;
  clientId: string | null;
  clientName: string | null;
  caseId: string | null;
  caseTitle: string | null;
  findingId: string | null;
  completedAt: string | null;
  /** Hidden from the open list until this date. */
  snoozedUntil: string | null;
  /** Acknowledgement / ARN number recorded when a filing was marked done. */
  ackNumber: string | null;
  adjustments: string[];
  warnings: string[];
  /** Statutory items: the form, whether a CA has checked the rule, and its source. */
  statutory: {
    form: string;
    periodLabel: string;
    verified: boolean;
    citation: string;
    url: string;
    packAsOf: string;
  } | null;
}

export interface DeadlineQuery {
  clientIds?: string[];
  /**
   * Client-level access (AuthContext.clientIds): only these clients, plus
   * items with no client. Undefined: every client.
   */
  scope?: readonly string[] | undefined;
  /** User ids; "none" for unassigned. */
  ownerIds?: string[];
  sources?: DeadlineSource[];
  statuses?: DeadlineStatus[];
  types?: DeadlineType[];
  caseId?: string;
  from?: string;
  to?: string;
  /** Leave out items snoozed past today. Default false. */
  hideSnoozed?: boolean;
}

/** GST, income tax, TDS or ROC, from a statutory rule key or a case's notice type. */
export function deadlineType(ruleKey: string | null, noticeType: string | null): DeadlineType {
  const key = (ruleKey ?? noticeType ?? "").toLowerCase();
  if (/(^|\.)gst(\.|$)|^in\.gst|gst/.test(key)) return "gst";
  if (/tds|24q|26q/.test(key)) return "tds";
  if (/roc|mca|aoc|mgt/.test(key)) return "roc";
  if (/^in\.it\.|income|itr|143|148|142|234|270a|it\./.test(key)) return "income_tax";
  return "other";
}

export function toDueState(dueOn: string, today: string, status: DeadlineStatus): DueState {
  const bucket = dueBucket(dueOn, today, { done: status !== "open" });
  return bucket === "this_week" ? "week" : bucket;
}

type Condition = Parameters<typeof and>[number];
type Detail = DeadlineDetail & { snoozedUntil?: string; ackNumber?: string };

export async function queryDeadlines(
  tx: OrgTx,
  orgId: string,
  today: string,
  q: DeadlineQuery = {},
): Promise<DeadlineRow[]> {
  const where: Condition[] = [eq(deadlines.orgId, orgId)];
  if (q.clientIds?.length) where.push(inArray(deadlines.clientId, q.clientIds));
  if (q.scope) {
    where.push(
      q.scope.length
        ? or(isNull(deadlines.clientId), inArray(deadlines.clientId, [...q.scope]))
        : isNull(deadlines.clientId),
    );
  }
  if (q.sources?.length) where.push(inArray(deadlines.source, q.sources));
  if (q.statuses?.length) where.push(inArray(deadlines.status, q.statuses));
  if (q.caseId) where.push(eq(deadlines.caseId, q.caseId));
  if (q.from) where.push(gte(deadlines.dueOn, q.from));
  if (q.to) where.push(lte(deadlines.dueOn, q.to));
  if (q.ownerIds?.length) {
    const ids = q.ownerIds.filter((o) => o !== "none");
    const parts: Condition[] = [];
    if (ids.length) parts.push(inArray(deadlines.ownerUserId, ids));
    if (q.ownerIds.includes("none")) parts.push(isNull(deadlines.ownerUserId));
    if (parts.length === 1) where.push(parts[0]);
    else if (parts.length > 1) where.push(or(...parts));
  }

  const rows = await tx
    .select({
      d: deadlines,
      clientName: clients.name,
      caseTitle: cases.title,
      noticeType: cases.noticeType,
    })
    .from(deadlines)
    .leftJoin(clients, and(eq(clients.orgId, deadlines.orgId), eq(clients.id, deadlines.clientId)))
    .leftJoin(cases, and(eq(cases.orgId, deadlines.orgId), eq(cases.id, deadlines.caseId)))
    .where(and(...where))
    .orderBy(asc(deadlines.dueOn), asc(deadlines.title));

  const out: DeadlineRow[] = [];
  for (const { d, clientName, caseTitle, noticeType } of rows) {
    const detail = (d.detail ?? {}) as unknown as Partial<Detail>;
    const st = detail.statutory;
    const type = deadlineType(st?.ruleKey ?? null, noticeType);
    if (q.types?.length && !q.types.includes(type)) continue;
    const snoozedUntil =
      detail.snoozedUntil && detail.snoozedUntil > today ? detail.snoozedUntil : null;
    if (q.hideSnoozed && snoozedUntil && d.status === "open") continue;
    out.push({
      id: d.id,
      title: d.title,
      dueOn: d.dueOn,
      windowEndOn: d.windowEndOn,
      windowBasis: detail.windowBasis ?? null,
      basis: d.basis,
      source: d.source,
      type,
      status: d.status,
      state: toDueState(d.dueOn, today, d.status),
      ownerUserId: d.ownerUserId,
      clientId: d.clientId,
      clientName,
      caseId: d.caseId,
      caseTitle,
      findingId: d.findingId,
      completedAt: d.completedAt ? d.completedAt.toISOString() : null,
      snoozedUntil,
      ackNumber: detail.ackNumber ?? null,
      adjustments: detail.adjustments ?? [],
      warnings: detail.warnings ?? [],
      statutory: st
        ? {
            form: st.form,
            periodLabel: st.periodLabel,
            verified: st.verified,
            citation: st.source.citation,
            url: st.source.url,
            packAsOf: st.packAsOf,
          }
        : null,
    });
  }
  return out;
}
