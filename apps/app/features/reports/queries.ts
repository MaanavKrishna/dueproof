/**
 * Report loaders (01 §4 Reports): the evidence report (each finding with the
 * page region that proves it, its basis and the audit trail), the client
 * statement, workload by person and week, the exposure report, and the
 * hearing pack. All org-scoped through withOrg; print-ready on the page.
 */
import "server-only";
import { listOrganisations, listOrgPeople } from "@dueproof/auth";
import { addMonths } from "@dueproof/core";
import {
  and,
  asc,
  cases,
  clients,
  desc,
  documents,
  eq,
  evidence,
  findings,
  gte,
  inArray,
  isNull,
  lte,
  orgSettings,
  pages,
  schema,
  withOrg,
} from "@dueproof/db";
import type { AuthContext } from "@/lib/authorize";
import { loadOrgCalendar } from "@/lib/calendar";
import { inScope } from "@/lib/can";
import { type DeadlineRow, queryDeadlines } from "@/lib/deadline-rows";
import { badRequest, notFound } from "@/lib/errors";
import { type ExposureView, loadExposure } from "@/lib/exposure";
import { whiteLabelReports } from "@/lib/licence";
import { todayIn } from "@/lib/pipeline/status";

const auditLog = schema.audit;

export interface ReportOrg {
  name: string;
  logoUrl: string | null;
  /** Hide "Prepared with Dueproof": the Business licence's white-label feature (lib/licence.ts). */
  whiteLabel: boolean;
}

async function reportOrg(ctx: AuthContext): Promise<ReportOrg> {
  const orgs = await listOrganisations(ctx.container.database);
  const org = orgs.find((o) => o.id === ctx.orgId);
  const [settings] = await withOrg(ctx.container.database, ctx.orgId, (tx) =>
    tx
      .select({ logo: orgSettings.reportLogoKey })
      .from(orgSettings)
      .where(eq(orgSettings.orgId, ctx.orgId))
      .limit(1),
  );
  let logoUrl: string | null = null;
  if (settings?.logo) {
    logoUrl =
      (await ctx.container.storage.getSignedUrl(settings.logo).catch(() => null))?.url ?? null;
  }
  return {
    name: org?.name ?? "Your organisation",
    logoUrl,
    whiteLabel: await whiteLabelReports(ctx.container),
  };
}

async function today(ctx: AuthContext): Promise<string> {
  const cal = await loadOrgCalendar(ctx.container, ctx.orgId);
  return todayIn(cal.timezone);
}

// ------------------------------------------------------------------ evidence

export interface EvidenceItem {
  findingId: string;
  kind: string;
  text: string;
  quote: string;
  origin: string;
  verification: string;
  confidence: number;
  status: string;
  confirmedBy: string | null;
  document: {
    id: string;
    filename: string;
    reference: string | null;
    docType: string | null;
    issuedOn: string | null;
    receivedOn: string | null;
  };
  caseId: string | null;
  caseTitle: string | null;
  clientName: string | null;
  /** The page region that proves it. Null when the finding is unlocated. */
  proof: {
    page: number;
    width: number;
    height: number;
    rects: [number, number, number, number][];
    imageUrl: string | null;
  } | null;
  /** Deadlines computed from this finding, with their basis. */
  deadlines: { dueOn: string; basis: string; windowEndOn: string | null }[];
}

export interface EvidenceReport {
  org: ReportOrg;
  generatedOn: string;
  scope: string;
  items: EvidenceItem[];
  audit: { at: string; actor: string; action: string; target: string }[];
}

export interface EvidenceScope {
  caseId?: string;
  clientId?: string;
  /** "2026-10-01..2026-11-30": documents received in the range. */
  range?: string;
}

export function parseRange(range: string | undefined): { from: string; to: string } | null {
  if (!range) return null;
  const m = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(range);
  if (!m?.[1] || !m[2] || m[1] > m[2]) throw badRequest("Use a range like 2026-10-01..2026-11-30.");
  return { from: m[1], to: m[2] };
}

export async function loadEvidenceReport(
  ctx: AuthContext,
  scope: EvidenceScope,
): Promise<EvidenceReport> {
  if (!scope.caseId && !scope.clientId && !scope.range)
    throw badRequest("Choose a case, a client or a date range.");
  const range = parseRange(scope.range);
  const org = await reportOrg(ctx);
  const people = new Map(
    (await listOrgPeople(ctx.container.database, ctx.orgId)).map((p) => [p.userId, p.name]),
  );
  const generatedOn = await today(ctx);
  const data = await withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const where = [eq(documents.orgId, ctx.orgId)];
    let label = "";
    if (scope.caseId) {
      const [c] = await tx
        .select()
        .from(cases)
        .where(and(eq(cases.orgId, ctx.orgId), eq(cases.id, scope.caseId)))
        .limit(1);
      if (!c || !inScope(ctx, c.clientId)) throw notFound("That case");
      where.push(eq(documents.caseId, c.id));
      label = c.title;
    }
    if (scope.clientId) {
      const [c] = await tx
        .select()
        .from(clients)
        .where(and(eq(clients.orgId, ctx.orgId), eq(clients.id, scope.clientId)))
        .limit(1);
      if (!c || !inScope(ctx, c.id)) throw notFound("That client");
      where.push(eq(documents.clientId, c.id));
      label = label ? `${label} · ${c.name}` : c.name;
    }
    if (range) {
      where.push(gte(documents.receivedOn, range.from), lte(documents.receivedOn, range.to));
      label = label
        ? `${label} · ${range.from} to ${range.to}`
        : `Received ${range.from} to ${range.to}`;
    }
    const docs = await tx
      .select({
        d: documents,
        caseTitle: cases.title,
        clientName: clients.name,
      })
      .from(documents)
      .leftJoin(cases, and(eq(cases.orgId, documents.orgId), eq(cases.id, documents.caseId)))
      .leftJoin(
        clients,
        and(eq(clients.orgId, documents.orgId), eq(clients.id, documents.clientId)),
      )
      .where(and(...where))
      .orderBy(asc(documents.receivedOn), asc(documents.createdAt))
      .limit(200)
      .then((rows) => rows.filter((x) => inScope(ctx, x.d.clientId)));
    const ids = docs.map((x) => x.d.id);
    if (!ids.length)
      return {
        label,
        items: [] as EvidenceItem[],
        auditRows: [] as (typeof auditLog.$inferSelect)[],
      };
    const [found, proof, pageRows, due] = await Promise.all([
      tx
        .select()
        .from(findings)
        .where(and(eq(findings.orgId, ctx.orgId), inArray(findings.documentId, ids)))
        .orderBy(asc(findings.ord)),
      tx
        .select()
        .from(evidence)
        .where(and(eq(evidence.orgId, ctx.orgId), inArray(evidence.documentId, ids))),
      tx
        .select({
          documentId: pages.documentId,
          page: pages.page,
          width: pages.width,
          height: pages.height,
          imageKey: pages.imageKey,
        })
        .from(pages)
        .where(and(eq(pages.orgId, ctx.orgId), inArray(pages.documentId, ids))),
      tx
        .select({
          findingId: schema.deadlines.findingId,
          dueOn: schema.deadlines.dueOn,
          basis: schema.deadlines.basis,
          windowEndOn: schema.deadlines.windowEndOn,
        })
        .from(schema.deadlines)
        .innerJoin(findings, eq(findings.id, schema.deadlines.findingId))
        .where(and(eq(schema.deadlines.orgId, ctx.orgId), inArray(findings.documentId, ids))),
    ]);
    const targets = [
      ...ids,
      ...new Set(docs.map((x) => x.d.caseId).filter((x): x is string => Boolean(x))),
    ];
    const auditRows = await tx
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, ctx.orgId), inArray(auditLog.targetId, targets)))
      .orderBy(asc(auditLog.id))
      .limit(300);
    const byDoc = new Map(docs.map((x) => [x.d.id, x]));
    const pageOf = new Map(pageRows.map((p) => [`${p.documentId}:${p.page}`, p]));
    const items: EvidenceItem[] = [];
    for (const f of found) {
      if (f.kind === "summary") continue;
      const doc = byDoc.get(f.documentId);
      if (!doc) continue;
      const ev = proof.filter((e) => e.findingId === f.id).sort((a, b) => b.score - a.score)[0];
      const page = ev ? pageOf.get(`${ev.documentId}:${ev.page}`) : undefined;
      items.push({
        findingId: f.id,
        kind: f.kind,
        text: f.textEn ?? f.text,
        quote: f.quote,
        origin: f.origin,
        verification: f.verification,
        confidence: f.confidence,
        status: f.status,
        confirmedBy: f.confirmedBy ? (people.get(f.confirmedBy) ?? "A colleague") : null,
        document: {
          id: doc.d.id,
          filename: doc.d.filename,
          reference: doc.d.reference,
          docType: doc.d.docType,
          issuedOn: doc.d.issuedOn,
          receivedOn: doc.d.receivedOn,
        },
        caseId: doc.d.caseId,
        caseTitle: doc.caseTitle,
        clientName: doc.clientName,
        proof:
          ev && page
            ? {
                page: ev.page,
                width: page.width,
                height: page.height,
                rects: ev.rects,
                imageUrl: page.imageKey
                  ? ((await ctx.container.storage.getSignedUrl(page.imageKey).catch(() => null))
                      ?.url ?? null)
                  : null,
              }
            : null,
        deadlines: due.filter((d) => d.findingId === f.id).map(({ findingId: _f, ...d }) => d),
      });
    }
    return { label, items, auditRows };
  });
  return {
    org,
    generatedOn,
    scope: data.label,
    items: data.items,
    audit: data.auditRows.map((a) => ({
      at: a.at.toISOString(),
      actor: a.actor ? (people.get(a.actor) ?? "A colleague") : "Dueproof",
      action: a.action,
      target: a.targetType ?? "",
    })),
  };
}

// ---------------------------------------------------------- client statement

export interface ClientStatement {
  org: ReportOrg;
  generatedOn: string;
  client: {
    id: string;
    name: string;
    legalName: string | null;
    pan: string | null;
    gstins: string[];
  };
  cases: {
    id: string;
    title: string;
    stage: string;
    reference: string | null;
    authority: string | null;
    openedAt: string;
  }[];
  deadlines: DeadlineRow[];
}

export async function loadClientStatement(
  ctx: AuthContext,
  clientId: string,
): Promise<ClientStatement> {
  const org = await reportOrg(ctx);
  const t = await today(ctx);
  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const [c] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.orgId, ctx.orgId), eq(clients.id, clientId)))
      .limit(1);
    if (!c || !inScope(ctx, c.id)) throw notFound("That client");
    const cs = await tx
      .select()
      .from(cases)
      .where(and(eq(cases.orgId, ctx.orgId), eq(cases.clientId, clientId), isNull(cases.closedAt)))
      .orderBy(desc(cases.openedAt));
    const due = await queryDeadlines(tx, ctx.orgId, t, {
      clientIds: [clientId],
      statuses: ["open"],
      to: addMonths(t, 3).date,
    });
    return {
      org,
      generatedOn: t,
      client: { id: c.id, name: c.name, legalName: c.legalName, pan: c.pan, gstins: c.gstins },
      cases: cs.map((k) => ({
        id: k.id,
        title: k.title,
        stage: k.stage,
        reference: k.reference,
        authority: k.authority,
        openedAt: k.openedAt.toISOString().slice(0, 10),
      })),
      deadlines: due,
    };
  });
}

// ------------------------------------------------------------------ workload

export interface WorkloadReport {
  org: ReportOrg;
  generatedOn: string;
  /** Mondays of the weeks shown. */
  weeks: string[];
  rows: {
    userId: string | null;
    name: string;
    overdue: number;
    perWeek: number[];
    later: number;
    total: number;
  }[];
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function loadWorkload(ctx: AuthContext, weeksAhead = 8): Promise<WorkloadReport> {
  const org = await reportOrg(ctx);
  const t = await today(ctx);
  const people = await listOrgPeople(ctx.container.database, ctx.orgId);
  const first = mondayOf(t);
  const weeks = Array.from({ length: weeksAhead }, (_, i) => plusDays(first, i * 7));
  const rows = await withOrg(ctx.container.database, ctx.orgId, (tx) =>
    queryDeadlines(tx, ctx.orgId, t, { statuses: ["open"], scope: ctx.clientIds }),
  );
  const byPerson = new Map<string | null, WorkloadReport["rows"][number]>();
  const row = (id: string | null) => {
    let r = byPerson.get(id);
    if (!r) {
      r = {
        userId: id,
        name: id ? (people.find((p) => p.userId === id)?.name ?? "Former member") : "Unassigned",
        overdue: 0,
        perWeek: weeks.map(() => 0),
        later: 0,
        total: 0,
      };
      byPerson.set(id, r);
    }
    return r;
  };
  for (const p of people) row(p.userId);
  const end = plusDays(first, weeksAhead * 7);
  for (const d of rows) {
    const r = row(d.ownerUserId);
    r.total += 1;
    if (d.dueOn < t) r.overdue += 1;
    else if (d.dueOn >= end) r.later += 1;
    else {
      const i = Math.floor((Date.parse(d.dueOn) - Date.parse(first)) / (7 * 86_400_000));
      if (r.perWeek[i] !== undefined) r.perWeek[i] += 1;
    }
  }
  return {
    org,
    generatedOn: t,
    weeks,
    rows: [...byPerson.values()].sort((a, b) =>
      a.userId === null
        ? 1
        : b.userId === null
          ? -1
          : b.total - a.total || a.name.localeCompare(b.name),
    ),
  };
}

// ------------------------------------------------------------------ exposure

export interface ExposureReport {
  org: ReportOrg;
  generatedOn: string;
  view: ExposureView;
}

export async function loadExposureReport(
  ctx: AuthContext,
  clientId?: string,
): Promise<ExposureReport> {
  const org = await reportOrg(ctx);
  const t = await today(ctx);
  const view = await withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const v = await loadExposure(tx, ctx.orgId, t, {
      ...(clientId ? { clientIds: [clientId] } : {}),
      scope: ctx.clientIds,
    });
    const names = await tx
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.orgId, ctx.orgId));
    for (const n of names) v.clientNames[n.id] ??= n.name;
    return v;
  });
  return { org, generatedOn: t, view };
}

// --------------------------------------------------------------- hearing pack

export interface HearingPack {
  org: ReportOrg;
  generatedOn: string;
  case: {
    id: string;
    title: string;
    reference: string | null;
    authority: string | null;
    noticeType: string | null;
    stage: string;
    clientName: string | null;
    filingRef: string | null;
    filedOn: string | null;
  };
  documents: {
    id: string;
    filename: string;
    role: string;
    reference: string | null;
    issuedOn: string | null;
    receivedOn: string | null;
    pageCount: number;
  }[];
  deadlines: DeadlineRow[];
  evidence: EvidenceReport;
}

export async function loadHearingPack(ctx: AuthContext, caseId: string): Promise<HearingPack> {
  const evidenceReport = await loadEvidenceReport(ctx, { caseId });
  const t = evidenceReport.generatedOn;
  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const [c] = await tx
      .select({ k: cases, clientName: clients.name })
      .from(cases)
      .leftJoin(clients, and(eq(clients.orgId, cases.orgId), eq(clients.id, cases.clientId)))
      .where(and(eq(cases.orgId, ctx.orgId), eq(cases.id, caseId)))
      .limit(1);
    if (!c || !inScope(ctx, c.k.clientId)) throw notFound("That case");
    const docs = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.caseId, caseId)))
      .orderBy(asc(documents.receivedOn), asc(documents.createdAt));
    const due = await queryDeadlines(tx, ctx.orgId, t, { caseId });
    return {
      org: evidenceReport.org,
      generatedOn: t,
      case: {
        id: c.k.id,
        title: c.k.title,
        reference: c.k.reference,
        authority: c.k.authority,
        noticeType: c.k.noticeType,
        stage: c.k.stage,
        clientName: c.clientName,
        filingRef: c.k.filingRef,
        filedOn: c.k.filedOn,
      },
      documents: docs.map((d) => ({
        id: d.id,
        filename: d.filename,
        role: d.role,
        reference: d.reference,
        issuedOn: d.issuedOn,
        receivedOn: d.receivedOn,
        pageCount: d.pageCount,
      })),
      deadlines: due,
      evidence: evidenceReport,
    };
  });
}

/** Cases and clients for the Reports index pickers. */
export async function loadReportPickers(ctx: AuthContext) {
  return withOrg(ctx.container.database, ctx.orgId, async (tx) => ({
    clients: await tx
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(eq(clients.orgId, ctx.orgId), isNull(clients.archivedAt)))
      .orderBy(asc(clients.name))
      .then((rows) => rows.filter((c) => inScope(ctx, c.id))),
    cases: await tx
      .select({ id: cases.id, name: cases.title, clientId: cases.clientId })
      .from(cases)
      .where(eq(cases.orgId, ctx.orgId))
      .orderBy(desc(cases.openedAt))
      .limit(500)
      .then((rows) =>
        rows.filter((c) => inScope(ctx, c.clientId)).map(({ clientId: _c, ...c }) => c),
      ),
  }));
}
