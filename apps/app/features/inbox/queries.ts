/**
 * The Inbox (01 §4): documents still processing (for the upload tray), the
 * needs-review queue, and documents not yet filed in a case, with a
 * suggested case when the reference matches one.
 */
import "server-only";
import { DateRule } from "@dueproof/contracts";
import { isDateError, resolveDate } from "@dueproof/core";
import {
  and,
  asc,
  cases,
  clients,
  deadlines,
  desc,
  documents,
  eq,
  evidence,
  findings,
  gte,
  inArray,
  isNull,
  ne,
  sql,
  withOrg,
} from "@dueproof/db";
import { formatMoney } from "@dueproof/i18n";
import type { AuthContext } from "@/lib/authorize";
import { clientScope, type DueState, dueState, fmtDate, fmtInstant, loadClock } from "@/lib/org";
import { countsFromReceipt } from "@/lib/received-date";
import { reviewReasons, reviewReasonText } from "@/lib/review";

export interface ReviewItem {
  id: string;
  /**
   * `received_date`: the document's received date was assumed (the upload
   * day) and deadlines run from it; a person confirms or sets the date.
   */
  kind: "finding" | "nothing_found" | "received_date";
  documentId: string;
  documentName: string;
  client: string | null;
  caseId: string | null;
  duty: string;
  quote: string | null;
  origin: "rule" | "ai" | "rule+ai" | "human";
  grade: "exact" | "strong" | "approximate" | "unlocated";
  page: number | null;
  reason: string;
  due: { state: DueState; date: string; iso: string } | null;
  basis: string | null;
  amountMinor: number | null;
  /** Both readings, when the rules and AI disagree (shown side by side). */
  conflict: { field: string; rule: string; ai: string } | null;
  /** For `received_date`: the assumed date. */
  received?: { iso: string; date: string };
}

export interface FileItem {
  id: string;
  name: string;
  reference: string | null;
  docType: string | null;
  status: string;
  received: string;
  /** Nobody gave the received date: the upload day stands in. */
  receivedAssumed: boolean;
  client: { id: string; name: string } | null;
  suggestedCase: { id: string; title: string; reference: string | null } | null;
  role: string;
}

export interface ProcessingItem {
  id: string;
  documentId: string;
  name: string;
  size: number;
  status: string;
}

export interface InboxData {
  /** The organisation's today (ISO), for date fields. */
  today: string;
  processing: ProcessingItem[];
  review: ReviewItem[];
  toFile: FileItem[];
  clients: { id: string; name: string; gstin: string | null }[];
  cases: { id: string; title: string; reference: string | null; client: string | null }[];
}

const SETTLED = ["ready", "needs_review"] as const;

function ruleWords(rule: unknown, dueOn: unknown, locale: string): string {
  if (typeof dueOn === "string") return fmtDate(dueOn, locale);
  const r = DateRule.safeParse(rule);
  if (!r.success) return "—";
  if (r.data.type === "fixed") return fmtDate(r.data.date, locale);
  if (r.data.type === "relative")
    return `${r.data.amount} ${r.data.unit.replace("_", " ")} from ${r.data.anchor}`;
  return `${r.data.ruleKey} ${r.data.period}`;
}

/** Both readings of a rule/AI disagreement, in words (04 §4: "both shown"). */
export function describeConflict(raw: unknown, locale = "en-IN"): ReviewItem["conflict"] {
  const c = raw as {
    conflicts?: {
      field: string;
      rule: unknown;
      ai: unknown;
      ruleDueOn?: string;
      aiDueOn?: string;
    }[];
  } | null;
  const first = c?.conflicts?.[0];
  if (!first) return null;
  if (first.field === "amount")
    return {
      field: "amount",
      rule: formatMoney(Number(first.rule), { locale }),
      ai: formatMoney(Number(first.ai), { locale }),
    };
  return {
    field: "due",
    rule: ruleWords(first.rule, first.ruleDueOn, locale),
    ai: ruleWords(first.ai, first.aiDueOn, locale),
  };
}

export async function loadInbox(ctx: AuthContext, now: Date = new Date()): Promise<InboxData> {
  const clock = await loadClock(ctx, now);
  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const recentDocs = await tx
      .select({
        id: documents.id,
        filename: documents.filename,
        sizeBytes: documents.sizeBytes,
        status: documents.status,
      })
      .from(documents)
      .where(
        and(
          eq(documents.orgId, ctx.orgId),
          clientScope(ctx, documents.clientId),
          ne(documents.status, "ready"),
          ne(documents.status, "needs_review"),
          gte(documents.createdAt, new Date(now.getTime() - 3 * 86_400_000)),
        ),
      )
      .orderBy(desc(documents.createdAt))
      .limit(30);

    const candidates = await tx
      .select({
        id: findings.id,
        text: findings.text,
        textEn: findings.textEn,
        quote: findings.quote,
        status: findings.status,
        confirmedBy: findings.confirmedBy,
        verification: findings.verification,
        origin: findings.origin,
        confidence: findings.confidence,
        dueRule: findings.dueRule,
        kind: findings.kind,
        amountMinor: findings.amountMinor,
        conflict: findings.conflict,
        documentId: findings.documentId,
        caseId: findings.caseId,
        deadlineId: deadlines.id,
        receivedOn: documents.receivedOn,
        issuedOn: documents.issuedOn,
        filename: documents.filename,
        title: documents.title,
        client: clients.name,
        page: evidence.page,
      })
      .from(findings)
      .innerJoin(documents, eq(documents.id, findings.documentId))
      .leftJoin(deadlines, eq(deadlines.findingId, findings.id))
      .leftJoin(clients, eq(clients.id, documents.clientId))
      .leftJoin(evidence, eq(evidence.findingId, findings.id))
      .where(
        and(
          eq(findings.orgId, ctx.orgId),
          clientScope(ctx, documents.clientId),
          eq(findings.status, "open"),
          isNull(findings.confirmedBy),
        ),
      )
      .orderBy(desc(findings.createdAt), asc(findings.ord))
      .limit(500);

    const review: ReviewItem[] = [];
    for (const f of candidates) {
      const reasons = reviewReasons({ ...f, hasDeadline: f.deadlineId !== null });
      if (!reasons.length) continue;
      let due: ReviewItem["due"] = null;
      let basis: string | null = null;
      const rule = f.dueRule ? DateRule.safeParse(f.dueRule) : null;
      if (rule?.success) {
        const r = resolveDate(rule.data, {
          anchors: {
            ...(f.receivedOn ? { receipt: f.receivedOn } : {}),
            ...(f.issuedOn ? { issue: f.issuedOn } : {}),
          },
          holidays: clock.holidays,
          workingDays: clock.workingDays,
          locale: clock.locale,
        });
        if (isDateError(r))
          basis = r.error === "missing_anchor" ? "Needs the receipt date" : r.message;
        else {
          due = {
            state: dueState(r.dueOn, clock.today),
            date: fmtDate(r.dueOn, clock.locale),
            iso: r.dueOn,
          };
          basis = r.basis;
        }
      }
      review.push({
        id: f.id,
        kind: "finding",
        documentId: f.documentId,
        documentName: f.title ?? f.filename,
        client: f.client,
        caseId: f.caseId,
        duty: f.textEn ?? f.text,
        quote: f.quote,
        origin: f.origin,
        grade: f.verification,
        page: f.page,
        reason: reviewReasonText(reasons),
        due,
        basis,
        amountMinor: f.amountMinor,
        conflict: describeConflict(f.conflict, clock.locale),
      });
    }

    // Documents whose received date was assumed and has deadlines (or proposed ones) counting from it.
    const assumed = await tx
      .select({
        id: documents.id,
        filename: documents.filename,
        title: documents.title,
        caseId: documents.caseId,
        receivedOn: documents.receivedOn,
        client: clients.name,
      })
      .from(documents)
      .leftJoin(clients, eq(clients.id, documents.clientId))
      .where(
        and(
          eq(documents.orgId, ctx.orgId),
          clientScope(ctx, documents.clientId),
          eq(documents.receivedOnAssumed, true),
          inArray(documents.status, [...SETTLED]),
        ),
      )
      .orderBy(desc(documents.createdAt))
      .limit(50);
    if (assumed.length) {
      const ids = assumed.map((d) => d.id);
      const rules = await tx
        .select({ documentId: findings.documentId, dueRule: findings.dueRule, dl: deadlines.rule })
        .from(findings)
        .leftJoin(
          deadlines,
          and(eq(deadlines.findingId, findings.id), eq(deadlines.status, "open")),
        )
        .where(
          and(
            eq(findings.orgId, ctx.orgId),
            inArray(findings.documentId, ids),
            eq(findings.status, "open"),
          ),
        );
      const windows = await tx
        .select({
          documentId: sql<string>`${deadlines.detail}->>'documentId'`,
          rule: deadlines.rule,
        })
        .from(deadlines)
        .where(
          and(
            eq(deadlines.orgId, ctx.orgId),
            eq(deadlines.source, "order"),
            eq(deadlines.status, "open"),
            inArray(sql<string>`${deadlines.detail}->>'documentId'`, ids),
          ),
        );
      const depends = new Set([
        ...rules.filter((r) => countsFromReceipt(r.dl ?? r.dueRule)).map((r) => r.documentId),
        ...windows.filter((w) => countsFromReceipt(w.rule)).map((w) => w.documentId),
      ]);
      for (const d of assumed) {
        if (!d.receivedOn || !depends.has(d.id)) continue;
        const date = fmtDate(d.receivedOn, clock.locale);
        review.push({
          id: `received:${d.id}`,
          kind: "received_date",
          documentId: d.id,
          documentName: d.title ?? d.filename,
          client: d.client,
          caseId: d.caseId,
          duty: "Received date assumed: confirm",
          quote: null,
          origin: "rule",
          grade: "unlocated",
          page: 1,
          reason: `Nobody gave the date this arrived, so the upload day (${date}) was used. Deadlines that run from receipt count from it: confirm it, or set the real date.`,
          due: null,
          basis: null,
          amountMinor: null,
          conflict: null,
          received: { iso: d.receivedOn, date },
        });
      }
    }

    // Documents read to the end with nothing found: a person adds the deadline by hand.
    const empties = await tx
      .select({
        id: documents.id,
        filename: documents.filename,
        title: documents.title,
        caseId: documents.caseId,
        client: clients.name,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .leftJoin(clients, eq(clients.id, documents.clientId))
      .leftJoin(findings, eq(findings.documentId, documents.id))
      .where(
        and(
          eq(documents.orgId, ctx.orgId),
          clientScope(ctx, documents.clientId),
          eq(documents.status, "needs_review"),
          isNull(findings.id),
        ),
      )
      .orderBy(desc(documents.createdAt))
      .limit(50);
    for (const d of empties) {
      review.push({
        id: `doc:${d.id}`,
        kind: "nothing_found",
        documentId: d.id,
        documentName: d.title ?? d.filename,
        client: d.client,
        caseId: d.caseId,
        duty: "No deadline found on this document",
        quote: null,
        origin: "rule",
        grade: "unlocated",
        page: 1,
        reason: `Read on ${fmtInstant(d.createdAt, clock.timezone)}; no text or no duty was found. Check the page, add a deadline by hand, or retake the photo.`,
        due: null,
        basis: null,
        amountMinor: null,
        conflict: null,
      });
    }

    const unfiled = await tx
      .select({
        id: documents.id,
        filename: documents.filename,
        title: documents.title,
        reference: documents.reference,
        docType: documents.docType,
        status: documents.status,
        receivedOn: documents.receivedOn,
        receivedOnAssumed: documents.receivedOnAssumed,
        role: documents.role,
        clientId: documents.clientId,
        client: clients.name,
      })
      .from(documents)
      .leftJoin(clients, eq(clients.id, documents.clientId))
      .where(
        and(
          eq(documents.orgId, ctx.orgId),
          clientScope(ctx, documents.clientId),
          isNull(documents.caseId),
          inArray(documents.status, [...SETTLED]),
        ),
      )
      .orderBy(desc(documents.createdAt))
      .limit(100);

    const refs = [...new Set(unfiled.map((d) => d.reference).filter((r): r is string => !!r))];
    const caseRows = await tx
      .select({
        id: cases.id,
        title: cases.title,
        reference: cases.reference,
        client: clients.name,
      })
      .from(cases)
      .leftJoin(clients, eq(clients.id, cases.clientId))
      .where(and(eq(cases.orgId, ctx.orgId), clientScope(ctx, cases.clientId)))
      .orderBy(desc(cases.openedAt))
      .limit(500);
    const byRef = new Map(
      caseRows
        .filter((c) => c.reference && refs.includes(c.reference))
        .map((c) => [c.reference, c]),
    );

    const clientRows = await tx
      .select({ id: clients.id, name: clients.name, gstins: clients.gstins })
      .from(clients)
      .where(
        and(eq(clients.orgId, ctx.orgId), isNull(clients.archivedAt), clientScope(ctx, clients.id)),
      )
      .orderBy(asc(clients.name))
      .limit(1000);

    return {
      today: clock.today,
      processing: recentDocs.map((d) => ({
        id: d.id,
        documentId: d.id,
        name: d.filename,
        size: d.sizeBytes,
        status: d.status,
      })),
      review,
      toFile: unfiled.map((d) => {
        const s = d.reference ? byRef.get(d.reference) : undefined;
        return {
          id: d.id,
          name: d.title ?? d.filename,
          reference: d.reference,
          docType: d.docType,
          status: d.status,
          role: d.role,
          received: fmtDate(d.receivedOn, clock.locale),
          receivedAssumed: d.receivedOnAssumed,
          client: d.clientId && d.client ? { id: d.clientId, name: d.client } : null,
          suggestedCase: s ? { id: s.id, title: s.title, reference: s.reference } : null,
        };
      }),
      clients: clientRows.map((c) => ({ id: c.id, name: c.name, gstin: c.gstins[0] ?? null })),
      cases: caseRows,
    };
  });
}
