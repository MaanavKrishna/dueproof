/**
 * Loaders for the Deadlines screen: every due item (notice, order,
 * statutory, manual) from a few months back to the end of the statutory
 * window, with holidays, people and clients for the filters.
 */
import "server-only";
import { listOrgPeople } from "@dueproof/auth";
import { addMonths } from "@dueproof/core";
import {
  and,
  asc,
  cases,
  clients,
  desc,
  eq,
  holidays,
  isNull,
  schema,
  withOrg,
} from "@dueproof/db";

const auditLog = schema.audit;

import type { AuthContext } from "@/lib/authorize";
import { loadOrgCalendar } from "@/lib/calendar";
import { inScope } from "@/lib/can";
import { type DeadlineQuery, type DeadlineRow, queryDeadlines } from "@/lib/deadline-rows";
import { todayIn } from "@/lib/pipeline/status";

export interface Option {
  id: string;
  name: string;
}

export interface DeadlinesPageData {
  today: string;
  timezone: string;
  workingDays: number[];
  rows: DeadlineRow[];
  holidays: { date: string; name: string }[];
  people: Option[];
  clients: Option[];
  cases: (Option & { clientId: string | null })[];
  me: string;
}

export async function loadDeadlinesPage(
  ctx: AuthContext,
  query: DeadlineQuery = {},
): Promise<DeadlinesPageData> {
  const cal = await loadOrgCalendar(ctx.container, ctx.orgId);
  const today = todayIn(cal.timezone);
  const people = await listOrgPeople(ctx.container.database, ctx.orgId);
  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const rows = await queryDeadlines(tx, ctx.orgId, today, {
      from: addMonths(today, -6).date,
      scope: ctx.clientIds,
      ...query,
    });
    const hol = await tx
      .select({ date: holidays.day, name: holidays.name })
      .from(holidays)
      .where(eq(holidays.orgId, ctx.orgId))
      .orderBy(asc(holidays.day));
    const cl = await tx
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(eq(clients.orgId, ctx.orgId), isNull(clients.archivedAt)))
      .orderBy(asc(clients.name))
      .then((rows) => rows.filter((c) => inScope(ctx, c.id)));
    const cs = await tx
      .select({ id: cases.id, name: cases.title, clientId: cases.clientId })
      .from(cases)
      .where(and(eq(cases.orgId, ctx.orgId), isNull(cases.closedAt)))
      .orderBy(asc(cases.title))
      .then((rows) => rows.filter((c) => inScope(ctx, c.clientId)));
    return {
      today,
      timezone: cal.timezone,
      workingDays: cal.workingDays,
      rows,
      holidays: hol,
      people: people.map((p) => ({ id: p.userId, name: p.name })),
      clients: cl,
      cases: cs,
      me: ctx.userId,
    };
  });
}

/** When this person last revoked their calendar feeds, in ms (tokens issued before are refused). */
export async function lastFeedRevocation(
  ctx: { container: AuthContext["container"] },
  orgId: string,
  userId: string,
): Promise<number> {
  return withOrg(ctx.container.database, orgId, async (tx) => {
    const [row] = await tx
      .select({ at: auditLog.at })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.orgId, orgId),
          eq(auditLog.action, "calendar.feed_revoked"),
          eq(auditLog.targetId, userId),
        ),
      )
      .orderBy(desc(auditLog.id))
      .limit(1);
    return row ? row.at.getTime() : 0;
  });
}
