/** Notices (01 §4): one row per case, with its next due date, open demand and saved views. */
import "server-only";
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
  or,
  savedViews,
  withOrg,
} from "@dueproof/db";
import type { AuthContext } from "@/lib/authorize";
import { dueState, fmtDate, loadClock, loadPeople, type Person } from "@/lib/org";
import type { CaseStageId, NoticeRow } from "./model";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  gu: "Gujarati",
  bn: "Bengali",
  pa: "Punjabi",
  or: "Odia",
  ur: "Urdu",
};

export function languageName(codes: string[]): string {
  if (!codes.length) return "English";
  return codes.map((c) => LANGUAGE_NAMES[c] ?? c.toUpperCase()).join(", ");
}

/** "in.gst.asmt10" → "GST · ASMT-10". */
export function noticeTypeLabel(docType: string | null): string {
  if (!docType) return "Notice";
  const parts = docType.split(".");
  const authority =
    parts[1] === "gst" ? "GST" : parts[1] === "it" ? "Income tax" : (parts[1] ?? "").toUpperCase();
  const form = (parts[2] ?? "").toUpperCase().replace(/^([A-Z]+)(\d+)/, "$1-$2");
  return [authority, form].filter(Boolean).join(" · ") || docType;
}

export interface SavedViewRow {
  id: string;
  name: string;
  shared: boolean;
  mine: boolean;
  filters: Record<string, string[]>;
}

export interface NoticesData {
  rows: NoticeRow[];
  people: Person[];
  views: SavedViewRow[];
  me: string;
}

export async function loadNoticeRows(
  ctx: AuthContext,
  now: Date = new Date(),
): Promise<NoticeRow[]> {
  const [clock, people] = await Promise.all([loadClock(ctx, now), loadPeople(ctx)]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const caseRows = await tx
      .select({
        id: cases.id,
        title: cases.title,
        noticeType: cases.noticeType,
        authority: cases.authority,
        reference: cases.reference,
        stage: cases.stage,
        ownerUserId: cases.ownerUserId,
        clientId: cases.clientId,
        client: clients.name,
        gstins: clients.gstins,
      })
      .from(cases)
      .leftJoin(clients, eq(clients.id, cases.clientId))
      .where(eq(cases.orgId, ctx.orgId))
      .orderBy(desc(cases.openedAt))
      .limit(5000);
    const [docRows, dueRows, demandRows] = await Promise.all([
      tx
        .select({
          caseId: documents.caseId,
          role: documents.role,
          receivedOn: documents.receivedOn,
          languages: documents.languages,
          channel: documents.channel,
        })
        .from(documents)
        .where(eq(documents.orgId, ctx.orgId))
        .orderBy(asc(documents.createdAt)),
      tx
        .select({ caseId: deadlines.caseId, dueOn: deadlines.dueOn })
        .from(deadlines)
        .where(and(eq(deadlines.orgId, ctx.orgId), eq(deadlines.status, "open")))
        .orderBy(asc(deadlines.dueOn)),
      tx
        .select({ caseId: demands.caseId, amount: demands.principalMinor })
        .from(demands)
        .where(and(eq(demands.orgId, ctx.orgId), eq(demands.status, "open"))),
    ]);
    const firstDoc = new Map<string, (typeof docRows)[number]>();
    for (const d of docRows) {
      if (!d.caseId) continue;
      const prev = firstDoc.get(d.caseId);
      if (!prev || (prev.role !== "notice" && d.role === "notice")) firstDoc.set(d.caseId, d);
    }
    const nextDue = new Map<string, string>();
    for (const d of dueRows) if (d.caseId && !nextDue.has(d.caseId)) nextDue.set(d.caseId, d.dueOn);
    const demand = new Map<string, number>();
    for (const d of demandRows) demand.set(d.caseId, (demand.get(d.caseId) ?? 0) + d.amount);

    return caseRows.map((c) => {
      const doc = firstDoc.get(c.id);
      const due = nextDue.get(c.id);
      return {
        id: c.id,
        client: c.client,
        clientId: c.clientId,
        gstin: c.gstins?.[0] ?? null,
        type: noticeTypeLabel(c.noticeType),
        reference: c.reference,
        issuedBy: c.authority,
        received: fmtDate(doc?.receivedOn, clock.locale),
        receivedIso: doc?.receivedOn ?? null,
        nextDue: due
          ? {
              state: c.stage === "closed" ? "done" : dueState(due, clock.today),
              date: fmtDate(due, clock.locale),
              iso: due,
            }
          : null,
        stage: c.stage as CaseStageId,
        demandMinor: demand.get(c.id) ?? null,
        owner: c.ownerUserId ? (nameOf.get(c.ownerUserId) ?? null) : null,
        ownerId: c.ownerUserId,
        language: languageName(doc?.languages ?? []),
        channel: doc?.channel ?? "upload",
      };
    });
  });
}

export async function loadNotices(ctx: AuthContext): Promise<NoticesData> {
  const [rows, people] = await Promise.all([loadNoticeRows(ctx), loadPeople(ctx)]);
  const views = await withOrg(ctx.container.database, ctx.orgId, (tx) =>
    tx
      .select()
      .from(savedViews)
      .where(
        and(
          eq(savedViews.orgId, ctx.orgId),
          eq(savedViews.screen, "notices"),
          or(eq(savedViews.userId, ctx.userId), eq(savedViews.shared, true)),
        ),
      )
      .orderBy(asc(savedViews.createdAt)),
  );
  return {
    rows,
    people,
    me: ctx.userId,
    views: views.map((v) => ({
      id: v.id,
      name: v.name,
      shared: v.shared,
      mine: v.userId === ctx.userId,
      filters: v.filters,
    })),
  };
}
