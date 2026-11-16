/** Loaders for the client list and the client page, org-scoped through withOrg. */
import "server-only";
import { listOrgPeople } from "@dueproof/auth";
import { addMonths } from "@dueproof/core";
import {
  and,
  asc,
  cases,
  clients,
  contacts,
  count,
  deadlines,
  desc,
  eq,
  holidays,
  isNull,
  registrations,
  sql,
  withOrg,
} from "@dueproof/db";
import type { AuthContext } from "@/lib/authorize";
import { loadOrgCalendar } from "@/lib/calendar";
import { may } from "@/lib/can";
import { type DeadlineRow, queryDeadlines } from "@/lib/deadline-rows";
import { notFound } from "@/lib/errors";
import { type ExposureView, loadExposure } from "@/lib/exposure";
import { todayIn } from "@/lib/pipeline/status";

export interface ClientListRow {
  id: string;
  name: string;
  legalName: string | null;
  pan: string | null;
  cin: string | null;
  tan: string | null;
  gstins: string[];
  tags: string[];
  partnerUserId: string | null;
  partnerName: string | null;
  openItems: number;
  overdue: number;
  /** Open demand plus computed interest, paise; null when the person may not see exposure. */
  exposureMinor: number | null;
}

export async function listClients(ctx: AuthContext): Promise<{
  rows: ClientListRow[];
  people: { id: string; name: string }[];
  canEdit: boolean;
  canSeeExposure: boolean;
}> {
  const cal = await loadOrgCalendar(ctx.container, ctx.orgId);
  const today = todayIn(cal.timezone);
  const people = await listOrgPeople(ctx.container.database, ctx.orgId);
  const names = new Map(people.map((p) => [p.userId, p.name]));
  const canSeeExposure = may(ctx, "exposure.view");
  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const list = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.orgId, ctx.orgId), isNull(clients.archivedAt)))
      .orderBy(asc(clients.name));
    const counts = await tx
      .select({
        clientId: deadlines.clientId,
        open: count(),
        overdue: sql<number>`count(*) filter (where ${deadlines.dueOn} < ${today})`.mapWith(Number),
      })
      .from(deadlines)
      .where(and(eq(deadlines.orgId, ctx.orgId), eq(deadlines.status, "open")))
      .groupBy(deadlines.clientId);
    const byClient = new Map(counts.map((c) => [c.clientId, c]));
    let exposure: ExposureView | null = null;
    if (canSeeExposure) exposure = await loadExposure(tx, ctx.orgId, today);
    return {
      rows: list.map((c) => {
        const t = exposure?.exposure.clients[c.id];
        return {
          id: c.id,
          name: c.name,
          legalName: c.legalName,
          pan: c.pan,
          cin: c.cin,
          tan: c.tan,
          gstins: c.gstins,
          tags: c.tags,
          partnerUserId: c.partnerUserId,
          partnerName: c.partnerUserId ? (names.get(c.partnerUserId) ?? null) : null,
          openItems: byClient.get(c.id)?.open ?? 0,
          overdue: byClient.get(c.id)?.overdue ?? 0,
          exposureMinor: canSeeExposure ? (t ? t.openMinor + t.computedInterestMinor : 0) : null,
        };
      }),
      people: people.map((p) => ({ id: p.userId, name: p.name })),
      canEdit: may(ctx, "client.edit"),
      canSeeExposure,
    };
  });
}

export type RegistrationRow = typeof registrations.$inferSelect;
export type ContactRow = typeof contacts.$inferSelect;

export interface ClientPageData {
  today: string;
  client: typeof clients.$inferSelect;
  registrations: RegistrationRow[];
  contacts: ContactRow[];
  cases: {
    id: string;
    title: string;
    stage: string;
    reference: string | null;
    noticeType: string | null;
    openedAt: string;
  }[];
  deadlines: DeadlineRow[];
  exposure: ExposureView | null;
  people: { id: string; name: string; role: string }[];
  holidays: { date: string; name: string }[];
  workingDays: number[];
  canEdit: boolean;
  canEditDeadlines: boolean;
  me: string;
}

export async function getClientPage(ctx: AuthContext, clientId: string): Promise<ClientPageData> {
  const cal = await loadOrgCalendar(ctx.container, ctx.orgId);
  const today = todayIn(cal.timezone);
  const people = await listOrgPeople(ctx.container.database, ctx.orgId);
  const canSeeExposure = may(ctx, "exposure.view");
  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const [client] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.orgId, ctx.orgId), eq(clients.id, clientId)))
      .limit(1);
    if (!client) throw notFound("That client");
    const regs = await tx
      .select()
      .from(registrations)
      .where(and(eq(registrations.orgId, ctx.orgId), eq(registrations.clientId, clientId)))
      .orderBy(asc(registrations.kind), asc(registrations.identifier));
    const people_ = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, ctx.orgId), eq(contacts.clientId, clientId)))
      .orderBy(asc(contacts.name));
    const caseRows = await tx
      .select({
        id: cases.id,
        title: cases.title,
        stage: cases.stage,
        reference: cases.reference,
        noticeType: cases.noticeType,
        openedAt: cases.openedAt,
      })
      .from(cases)
      .where(and(eq(cases.orgId, ctx.orgId), eq(cases.clientId, clientId)))
      .orderBy(desc(cases.openedAt));
    const due = await queryDeadlines(tx, ctx.orgId, today, {
      clientIds: [clientId],
      from: addMonths(today, -3).date,
      to: addMonths(today, 6).date,
    });
    const exposure = canSeeExposure
      ? await loadExposure(tx, ctx.orgId, today, { clientIds: [clientId] })
      : null;
    const hol = await tx
      .select({ date: holidays.day, name: holidays.name })
      .from(holidays)
      .where(eq(holidays.orgId, ctx.orgId));
    return {
      today,
      client,
      registrations: regs,
      contacts: people_,
      cases: caseRows.map((c) => ({ ...c, openedAt: c.openedAt.toISOString() })),
      deadlines: due,
      exposure,
      people: people.map((p) => ({ id: p.userId, name: p.name, role: p.role })),
      holidays: hol,
      workingDays: cal.workingDays,
      canEdit: may(ctx, "client.edit"),
      canEditDeadlines: may(ctx, "deadline.edit"),
      me: ctx.userId,
    };
  });
}

/** Clients that look like the same firm: the same PAN, or a shared GSTIN. */
export async function findDuplicates(
  ctx: AuthContext,
): Promise<{ key: string; clients: { id: string; name: string }[] }[]> {
  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const list = await tx
      .select({ id: clients.id, name: clients.name, pan: clients.pan, gstins: clients.gstins })
      .from(clients)
      .where(and(eq(clients.orgId, ctx.orgId), isNull(clients.archivedAt)));
    const groups = new Map<string, { id: string; name: string }[]>();
    for (const c of list) {
      const keys = new Set<string>();
      if (c.pan) keys.add(`PAN ${c.pan}`);
      for (const g of c.gstins) keys.add(`GSTIN ${g}`);
      for (const k of keys) groups.set(k, [...(groups.get(k) ?? []), { id: c.id, name: c.name }]);
    }
    const seen = new Set<string>();
    const out: { key: string; clients: { id: string; name: string }[] }[] = [];
    for (const [key, members] of groups) {
      if (members.length < 2) continue;
      const sig = members
        .map((m) => m.id)
        .sort()
        .join(",");
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ key, clients: members });
    }
    return out;
  });
}
