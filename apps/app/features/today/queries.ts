/**
 * Today (01 §4): one read for the home screen. Buckets come from core's due
 * ladder with "today" in the organisation's timezone; exposure from core's
 * aggregateExposure over the demands as stated plus interest computed by
 * code. Every query runs in withOrg.
 */
import "server-only";
import {
  addDays,
  aggregateExposure,
  type ComputedLine,
  can,
  type DemandLine,
} from "@dueproof/core";
import {
  and,
  asc,
  cases,
  clients,
  deadlines,
  demands,
  desc,
  documents,
  eq,
  findings,
  gte,
  inArray,
  isNull,
  lte,
  or,
  withOrg,
} from "@dueproof/db";
import type { AuthContext } from "@/lib/authorize";
import {
  clientScope,
  type DueState,
  dueState,
  fmtDate,
  fmtInstant,
  loadClock,
  loadPeople,
} from "@/lib/org";
import { reviewReasons } from "@/lib/review";

export type TodayScope = "mine" | "team" | "everyone";

export interface TodayRow {
  id: string;
  client: string | null;
  title: string;
  dueOn: string;
  dueLabel: string;
  state: DueState;
  owner: string | null;
  caseId: string | null;
  documentId: string | null;
  findingId: string | null;
  source: "notice" | "order" | "statutory" | "manual";
  basis: string;
  hearing: boolean;
}

export interface TodayData {
  scope: TodayScope;
  scopes: TodayScope[];
  today: string;
  todayLabel: string;
  firstName: string;
  overdue: TodayRow[];
  dueToday: TodayRow[];
  thisWeek: TodayRow[];
  hearings: TodayRow[];
  review: {
    count: number;
    items: {
      id: string;
      title: string;
      client: string | null;
      caseId: string | null;
      documentId: string;
    }[];
  };
  recent: {
    id: string;
    name: string;
    client: string | null;
    status: string;
    at: string;
    caseId: string | null;
  }[];
  approvals:
    | { id: string; title: string; client: string | null; reference: string | null }[]
    | null;
  exposure: {
    openMinor: number;
    interestMinor: number;
    penaltyLowMinor: number;
    penaltyHighMinor: number;
    deltaMinor: number;
    top: {
      id: string;
      label: string;
      openMinor: number;
      interestMinor: number;
      penalty: { min: number; max: number };
    }[];
  } | null;
}

/** Which toggles a role gets (01 §4: role-dependent). */
export function scopesFor(role: AuthContext["role"]): TodayScope[] {
  if (role === "viewer") return ["everyone"];
  if (role === "member") return ["mine", "everyone"];
  return ["mine", "team", "everyone"];
}

export function defaultScope(role: AuthContext["role"]): TodayScope {
  if (role === "owner" || role === "admin" || role === "viewer") return "everyone";
  if (role === "manager") return "team";
  return "mine";
}

export async function loadToday(
  ctx: AuthContext,
  requested?: string | null,
  now: Date = new Date(),
): Promise<TodayData> {
  const scopes = scopesFor(ctx.role);
  const scope = scopes.includes(requested as TodayScope)
    ? (requested as TodayScope)
    : defaultScope(ctx.role);
  const [clock, people] = await Promise.all([loadClock(ctx, now), loadPeople(ctx)]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const { today } = clock;
  const weekEnd = addDays(today, 6);
  const subject = { userId: ctx.userId, role: ctx.role, mayApproveReplies: ctx.mayApproveReplies };

  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const owner = (deadlineOwner: typeof deadlines.ownerUserId) =>
      scope === "mine"
        ? or(
            eq(deadlineOwner, ctx.userId),
            and(isNull(deadlineOwner), eq(cases.ownerUserId, ctx.userId)),
          )
        : scope === "team"
          ? or(
              eq(deadlineOwner, ctx.userId),
              eq(cases.ownerUserId, ctx.userId),
              eq(clients.partnerUserId, ctx.userId),
              and(isNull(deadlineOwner), isNull(cases.ownerUserId)),
            )
          : undefined;

    const dueRows = await tx
      .select({
        id: deadlines.id,
        title: deadlines.title,
        dueOn: deadlines.dueOn,
        source: deadlines.source,
        basis: deadlines.basis,
        ownerUserId: deadlines.ownerUserId,
        caseOwner: cases.ownerUserId,
        caseId: deadlines.caseId,
        findingId: deadlines.findingId,
        documentId: findings.documentId,
        kind: findings.kind,
        client: clients.name,
      })
      .from(deadlines)
      .leftJoin(cases, eq(cases.id, deadlines.caseId))
      .leftJoin(clients, eq(clients.id, deadlines.clientId))
      .leftJoin(findings, eq(findings.id, deadlines.findingId))
      .where(
        and(
          eq(deadlines.orgId, ctx.orgId),
          clientScope(ctx, deadlines.clientId),
          eq(deadlines.status, "open"),
          lte(deadlines.dueOn, weekEnd),
          owner(deadlines.ownerUserId),
        ),
      )
      .orderBy(asc(deadlines.dueOn))
      .limit(500);

    const rows: TodayRow[] = dueRows.map((r) => {
      const ownerId = r.ownerUserId ?? r.caseOwner;
      return {
        id: r.id,
        client: r.client,
        title: r.title,
        dueOn: r.dueOn,
        dueLabel: fmtDate(r.dueOn, clock.locale),
        state: dueState(r.dueOn, today),
        owner: ownerId ? (nameOf.get(ownerId) ?? null) : null,
        caseId: r.caseId,
        documentId: r.documentId,
        findingId: r.findingId,
        source: r.source,
        basis: r.basis,
        hearing: r.kind === "hearing",
      };
    });

    // Review queue: open, unconfirmed findings; the rule is in lib/review.
    const candidates = await tx
      .select({
        id: findings.id,
        text: findings.text,
        textEn: findings.textEn,
        status: findings.status,
        confirmedBy: findings.confirmedBy,
        verification: findings.verification,
        origin: findings.origin,
        confidence: findings.confidence,
        dueRule: findings.dueRule,
        kind: findings.kind,
        documentId: findings.documentId,
        caseId: findings.caseId,
        deadlineId: deadlines.id,
        client: clients.name,
      })
      .from(findings)
      .leftJoin(deadlines, eq(deadlines.findingId, findings.id))
      .leftJoin(documents, eq(documents.id, findings.documentId))
      .leftJoin(clients, eq(clients.id, documents.clientId))
      .where(
        and(
          eq(findings.orgId, ctx.orgId),
          clientScope(ctx, documents.clientId),
          eq(findings.status, "open"),
          isNull(findings.confirmedBy),
        ),
      )
      .orderBy(desc(findings.createdAt))
      .limit(500);
    const toReview = candidates.filter(
      (f) => reviewReasons({ ...f, hasDeadline: f.deadlineId !== null }).length > 0,
    );

    const recentDocs = await tx
      .select({
        id: documents.id,
        filename: documents.filename,
        title: documents.title,
        status: documents.status,
        createdAt: documents.createdAt,
        caseId: documents.caseId,
        client: clients.name,
      })
      .from(documents)
      .leftJoin(clients, eq(clients.id, documents.clientId))
      .where(
        and(
          eq(documents.orgId, ctx.orgId),
          clientScope(ctx, documents.clientId),
          gte(documents.createdAt, new Date(now.getTime() - 7 * 86_400_000)),
        ),
      )
      .orderBy(desc(documents.createdAt))
      .limit(6);

    let approvals: TodayData["approvals"] = null;
    if (can(subject, "reply.approve", { requestedBy: "someone-else" })) {
      const rows = await tx
        .select({
          id: cases.id,
          title: cases.title,
          reference: cases.reference,
          client: clients.name,
        })
        .from(cases)
        .leftJoin(clients, eq(clients.id, cases.clientId))
        .where(
          and(
            eq(cases.orgId, ctx.orgId),
            eq(cases.stage, "approval"),
            clientScope(ctx, cases.clientId),
          ),
        )
        .limit(10);
      approvals = rows;
    }

    let exposure: TodayData["exposure"] = null;
    if (can(subject, "exposure.view")) {
      const rowsD = await tx
        .select({
          clientId: demands.clientId,
          caseId: demands.caseId,
          taxType: demands.taxType,
          head: demands.head,
          status: demands.status,
          principal: demands.principalMinor,
          interest: demands.interestMinor,
          low: demands.penaltyMinMinor,
          high: demands.penaltyMaxMinor,
          createdAt: demands.createdAt,
          stage: cases.stage,
        })
        .from(demands)
        .leftJoin(cases, eq(cases.id, demands.caseId))
        .where(and(eq(demands.orgId, ctx.orgId), clientScope(ctx, demands.clientId)));
      const lines = (rs: typeof rowsD): { d: DemandLine[]; c: ComputedLine[] } => ({
        d: rs.map((r) => ({
          clientId: r.clientId ?? "unassigned",
          caseId: r.caseId,
          taxType: r.taxType,
          ...(r.stage ? { stage: r.stage } : {}),
          head: r.head,
          status: r.status,
          amountMinor: r.principal,
        })),
        c: rs
          .filter((r) => r.status === "open")
          .map((r) => ({
            clientId: r.clientId ?? "unassigned",
            caseId: r.caseId,
            taxType: r.taxType,
            ...(r.stage ? { stage: r.stage } : {}),
            interestMinor: r.interest ?? 0,
            penaltyLowMinor: r.low ?? 0,
            penaltyHighMinor: r.high ?? 0,
          })),
      });
      const nowLines = lines(rowsD);
      const agg = aggregateExposure(nowLines.d, nowLines.c);
      const monthStart = new Date(`${today.slice(0, 8)}01T00:00:00Z`);
      const then = lines(rowsD.filter((r) => r.createdAt < monthStart));
      const before = aggregateExposure(then.d, then.c);
      const ids = agg.ranking.slice(0, 5).map((r) => r.clientId);
      const names = ids.length
        ? await tx
            .select({ id: clients.id, name: clients.name })
            .from(clients)
            .where(and(eq(clients.orgId, ctx.orgId), inArray(clients.id, ids)))
        : [];
      const nameById = new Map(names.map((n) => [n.id, n.name]));
      exposure = {
        openMinor: agg.firm.openMinor,
        interestMinor: agg.firm.computedInterestMinor,
        penaltyLowMinor: agg.firm.penaltyLowMinor,
        penaltyHighMinor: agg.firm.penaltyHighMinor,
        deltaMinor: agg.firm.openMinor - before.firm.openMinor,
        top: agg.ranking.slice(0, 5).map((r) => {
          const t = agg.clients[r.clientId];
          return {
            id: r.clientId,
            label: nameById.get(r.clientId) ?? "No client yet",
            openMinor: r.openMinor,
            interestMinor: r.computedInterestMinor,
            penalty: { min: t?.penaltyLowMinor ?? 0, max: t?.penaltyHighMinor ?? 0 },
          };
        }),
      };
    }

    const me = people.find((p) => p.id === ctx.userId);
    return {
      scope,
      scopes,
      today,
      todayLabel: fmtDate(today, clock.locale),
      firstName: (me?.name ?? "").split(/\s+/)[0] ?? "",
      overdue: rows.filter((r) => r.state === "overdue" && !r.hearing),
      dueToday: rows.filter((r) => r.state === "today" && !r.hearing),
      thisWeek: rows.filter((r) => r.state === "week" && !r.hearing),
      hearings: rows.filter((r) => r.hearing && r.dueOn >= today && r.dueOn <= weekEnd),
      review: {
        count: toReview.length,
        items: toReview.slice(0, 5).map((f) => ({
          id: f.id,
          title: f.textEn ?? f.text,
          client: f.client,
          caseId: f.caseId,
          documentId: f.documentId,
        })),
      },
      recent: recentDocs.map((d) => ({
        id: d.id,
        name: d.title ?? d.filename,
        client: d.client,
        status: d.status,
        at: fmtInstant(d.createdAt, clock.timezone),
        caseId: d.caseId,
      })),
      approvals,
      exposure,
    };
  });
}

/** "3 overdue, 5 due this week, 12 to review." */
export function summarySentence(
  d: Pick<TodayData, "overdue" | "dueToday" | "thisWeek" | "review" | "hearings">,
): string {
  const parts: string[] = [];
  if (d.overdue.length) parts.push(`${d.overdue.length} overdue`);
  if (d.dueToday.length) parts.push(`${d.dueToday.length} due today`);
  if (d.thisWeek.length) parts.push(`${d.thisWeek.length} due this week`);
  if (d.hearings.length)
    parts.push(`${d.hearings.length} hearing${d.hearings.length === 1 ? "" : "s"} this week`);
  if (d.review.count) parts.push(`${d.review.count} to review`);
  if (!parts.length) return "Nothing is due this week and nothing waits for review.";
  const text = parts.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
