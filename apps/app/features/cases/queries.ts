/**
 * The case page (01 §4): header, stage history, thread, findings with their
 * deadlines and proof, demands with workings, and activity. One org-scoped
 * read; the first notice's pages come with it so the proof viewer paints
 * at once.
 */
import "server-only";
import { can } from "@dueproof/core";
import {
  aiRuns,
  and,
  asc,
  cases,
  clients,
  comments,
  deadlines,
  demands,
  desc,
  documents,
  eq,
  evidence,
  findingEdits,
  findings,
  inArray,
  schema,
  withOrg,
} from "@dueproof/db";
import type { AuthContext } from "@/lib/authorize";
import { computeDemand } from "@/lib/demands";
import { notFound } from "@/lib/errors";
import { hearingState, readHearingTime } from "@/lib/hearing-time";
import {
  clientAllowed,
  type DueState,
  dueState,
  fmtDate,
  fmtInstant,
  loadClock,
  loadPeople,
  type Person,
} from "@/lib/org";
import { type ProofData, readProof } from "@/lib/proof";
import { reviewReasons, reviewReasonText } from "@/lib/review";
import { approvalRequester, STAGE_LABEL, type Stage } from "@/lib/stages";

const auditLog = schema.audit;

export type Authority = "gst" | "income-tax" | "roc" | "court" | "sebi" | "rbi" | "other";

export function authorityOf(docType: string | null, office: string | null): Authority {
  const t = `${docType ?? ""} ${office ?? ""}`.toLowerCase();
  if (/gst|state tax|central tax|cgst|sgst/.test(t)) return "gst";
  if (/income|\.it\.|tds|cpc/.test(t)) return "income-tax";
  if (/roc|registrar of companies|mca/.test(t)) return "roc";
  if (/sebi/.test(t)) return "sebi";
  if (/rbi|reserve bank/.test(t)) return "rbi";
  if (/court|tribunal/.test(t)) return "court";
  return "other";
}

export interface CaseFinding {
  id: string;
  documentId: string;
  kind: string;
  duty: string;
  original: string;
  quote: string;
  quoteLang: string;
  origin: "rule" | "ai" | "rule+ai" | "human";
  grade: "exact" | "strong" | "approximate" | "unlocated";
  page: number | null;
  status: string;
  owner: string | null;
  amountMinor: number | null;
  needsReview: boolean;
  reviewReason: string | null;
  edited: boolean;
  deadline: {
    id: string;
    state: DueState;
    date: string;
    iso: string;
    basis: string;
    windowEnd: string | null;
    windowBasis: string | null;
    /** What a person should look at (the date engine's warnings). */
    warnings: string[];
    /** Counted from a received date nobody gave: shown as "received date assumed: confirm". */
    receivedAssumed: boolean;
    status: string;
  } | null;
}

export interface CaseDocument {
  id: string;
  name: string;
  role: string;
  status: string;
  received: string;
  receivedIso: string | null;
  /** Nobody gave the received date: the upload day stands in until a person confirms it. */
  receivedAssumed: boolean;
  pages: number;
  languages: string[];
  docType: string | null;
  hasAppealWindow: boolean;
}

export interface CaseDemand {
  id: string;
  taxType: string;
  head: string;
  status: string;
  principalMinor: number;
  interestRule: string | null;
  penaltyRule: string | null;
  dueOn: string | null;
  asOf: string | null;
  /** asOf in the house date format: "18 Nov 2026". */
  asOfLabel: string | null;
  /** False when the penalty rule is not yet checked by a chartered accountant. */
  penaltyVerified: boolean;
  findingId: string | null;
  interestMinor: number | null;
  penalty: { min: number; max: number } | null;
  workings: { label: string; formula: string; inputs: Record<string, string>; result: string }[];
  penaltyWorkings: {
    label: string;
    formula: string;
    inputs: Record<string, string>;
    result: string;
  }[];
  rateSource: string | null;
  warnings: string[];
  error: string | null;
}

export interface CaseActivity {
  id: string;
  kind: "comment" | "history" | "audit" | "ai";
  actor: string;
  at: string;
  time: string;
  action?: string;
  change?: { from?: string; to: string };
  body?: string;
  reason?: string;
}

export interface CaseData {
  id: string;
  title: string;
  typeLabel: string;
  authority: Authority;
  reference: string | null;
  issuingOffice: string;
  stage: Stage;
  stageDetails: Partial<Record<Stage, string>>;
  skipped: Stage[];
  client: { id: string; name: string; gstin: string | null } | null;
  owner: { id: string; name: string } | null;
  approvedBy: string | null;
  approvalRequestedBy: { id: string; name: string } | null;
  filingRef: string | null;
  filedOn: string | null;
  notice: CaseDocument | null;
  receivedHistory: { from: string; to: string; reason: string; by: string; at: string }[];
  documents: CaseDocument[];
  findings: CaseFinding[];
  summary: { text: string; original: string; origin: string } | null;
  sections: string[];
  amountMinor: number | null;
  otherDeadlines: {
    id: string;
    title: string;
    state: DueState;
    date: string;
    iso: string;
    basis: string;
    windowEnd: string | null;
    source: string;
    status: string;
  }[];
  demands: CaseDemand[];
  activity: CaseActivity[];
  people: Person[];
  me: { id: string; name: string };
  today: string;
  todayLabel: string;
  languages: string[];
  proof: ProofData | null;
  can: {
    edit: boolean;
    assign: boolean;
    move: boolean;
    review: boolean;
    comment: boolean;
    upload: boolean;
    approve: boolean;
    editDeadlines: boolean;
    exposure: boolean;
  };
}

const ACTION_WORDS: Record<string, string> = {
  "case.create": "opened the case",
  "case.assign": "changed the owner",
  "case.stage": "moved the stage",
  "case.approve": "approved the reply",
  "case.document.link": "added a document to the thread",
  "document.upload.init": "uploaded a document",
  "document.upload.complete": "finished an upload",
  "document.processed": "read the document",
  "document.received_date": "corrected the received date",
  "document.password_entered": "entered the PDF's password",
  "deadline.correct": "corrected a due date",
  "deadline.recompute": "recomputed a due date",
  "deadline.status": "changed a deadline's status",
  "deadline.create": "added a deadline by hand",
  "finding.confirm": "confirmed a finding",
  "finding.edit": "corrected a finding",
  "finding.dismiss": "dismissed a finding",
  "finding.restore": "restored a finding",
  "demand.save": "entered a demand",
  "case.appeal_window": "added the appeal window",
};

/**
 * Where a link with a bare id should go: the case itself, the case a
 * document is filed in, or (for a document not in a case yet) the Inbox.
 * Null when the id is neither, or names something this member can't see.
 */
export async function locate(
  ctx: AuthContext,
  id: string,
): Promise<{ caseId: string; documentId?: string } | { inbox: true } | null> {
  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const [c] = await tx
      .select({ id: cases.id, clientId: cases.clientId })
      .from(cases)
      .where(and(eq(cases.orgId, ctx.orgId), eq(cases.id, id)))
      .limit(1);
    if (c) return clientAllowed(ctx, c.clientId) ? { caseId: c.id } : null;
    const [d] = await tx
      .select({ id: documents.id, caseId: documents.caseId, clientId: documents.clientId })
      .from(documents)
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.id, id)))
      .limit(1);
    if (!d || !clientAllowed(ctx, d.clientId)) return null;
    return d.caseId ? { caseId: d.caseId, documentId: d.id } : { inbox: true };
  });
}

export async function loadCase(
  ctx: AuthContext,
  caseId: string,
  now: Date = new Date(),
): Promise<CaseData> {
  const [clock, people] = await Promise.all([loadClock(ctx, now), loadPeople(ctx)]);
  const nameOf = (id: string | null | undefined) =>
    id ? (people.find((p) => p.id === id)?.name ?? "A former member") : "Dueproof";
  const { storage } = ctx.container;

  return withOrg(ctx.container.database, ctx.orgId, async (tx) => {
    const [c] = await tx
      .select()
      .from(cases)
      .where(and(eq(cases.orgId, ctx.orgId), eq(cases.id, caseId)))
      .limit(1);
    if (!c || !clientAllowed(ctx, c.clientId)) throw notFound("That case");
    const [client] = c.clientId
      ? await tx
          .select()
          .from(clients)
          .where(and(eq(clients.orgId, ctx.orgId), eq(clients.id, c.clientId)))
          .limit(1)
      : [];

    const docs = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.orgId, ctx.orgId), eq(documents.caseId, c.id)))
      .orderBy(asc(documents.createdAt));
    const docIds = docs.map((d) => d.id);
    const [fRows, dRows, demandRows, commentRows, editRows] = await Promise.all([
      docIds.length
        ? tx
            .select({ f: findings, page: evidence.page })
            .from(findings)
            .leftJoin(evidence, eq(evidence.findingId, findings.id))
            .where(and(eq(findings.orgId, ctx.orgId), inArray(findings.documentId, docIds)))
            .orderBy(asc(findings.ord))
        : Promise.resolve([]),
      tx
        .select()
        .from(deadlines)
        .where(and(eq(deadlines.orgId, ctx.orgId), eq(deadlines.caseId, c.id)))
        .orderBy(asc(deadlines.dueOn)),
      tx
        .select()
        .from(demands)
        .where(and(eq(demands.orgId, ctx.orgId), eq(demands.caseId, c.id)))
        .orderBy(asc(demands.createdAt)),
      tx
        .select()
        .from(comments)
        .where(and(eq(comments.orgId, ctx.orgId), eq(comments.caseId, c.id)))
        .orderBy(asc(comments.createdAt)),
      tx
        .select({ findingId: findingEdits.findingId })
        .from(findingEdits)
        .innerJoin(findings, eq(findings.id, findingEdits.findingId))
        .where(and(eq(findingEdits.orgId, ctx.orgId), eq(findings.caseId, c.id))),
    ]);
    const fIds = fRows.map((r) => r.f.id);
    const dIds = dRows.map((d) => d.id);
    const targets = [c.id, ...docIds, ...fIds, ...dIds, ...demandRows.map((d) => d.id)];
    const [auditRows, runRows] = await Promise.all([
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.orgId, ctx.orgId), inArray(auditLog.targetId, targets)))
        .orderBy(asc(auditLog.id))
        .limit(500),
      docIds.length
        ? tx
            .select({
              id: aiRuns.id,
              feature: aiRuns.feature,
              model: aiRuns.model,
              outcome: aiRuns.outcome,
              inputTokens: aiRuns.inputTokens,
              outputTokens: aiRuns.outputTokens,
              createdAt: aiRuns.createdAt,
            })
            .from(aiRuns)
            .where(and(eq(aiRuns.orgId, ctx.orgId), inArray(aiRuns.documentId, docIds)))
            .orderBy(desc(aiRuns.createdAt))
            .limit(50)
        : Promise.resolve([]),
    ]);

    const edited = new Set(editRows.map((e) => e.findingId));
    const deadlineByFinding = new Map(
      dRows.filter((d) => d.findingId).map((d) => [d.findingId, d]),
    );
    const notice = docs.find((d) => d.role === "notice") ?? docs[0] ?? null;

    const toDoc = (d: (typeof docs)[number]): CaseDocument => ({
      id: d.id,
      name: d.title ?? d.filename,
      role: d.role,
      status: d.status,
      received: fmtDate(d.receivedOn, clock.locale),
      receivedIso: d.receivedOn,
      receivedAssumed: d.receivedOnAssumed,
      pages: d.pageCount,
      languages: d.languages,
      docType: d.docType,
      hasAppealWindow: dRows.some(
        (x) =>
          x.source === "order" && (x.detail as { documentId?: string } | null)?.documentId === d.id,
      ),
    });

    const caseFindings: CaseFinding[] = fRows
      .filter((r) => r.f.kind !== "summary")
      .map(({ f, page }) => {
        const dl = deadlineByFinding.get(f.id);
        const reasons = reviewReasons({ ...f, hasDeadline: Boolean(dl) });
        const detail = (dl?.detail ?? null) as {
          windowBasis?: string;
          warnings?: string[];
          receivedOnAssumed?: boolean;
        } | null;
        // A hearing keeps its time (M8): read from its own words.
        const time = f.kind === "hearing" ? readHearingTime(f.quote ?? f.text) : null;
        return {
          id: f.id,
          documentId: f.documentId,
          kind: f.kind,
          duty: f.textEn ?? f.text,
          original: f.text,
          quote: f.quote,
          quoteLang: f.quoteLang,
          origin: f.origin,
          grade: f.verification,
          page,
          status: f.status,
          owner: f.ownerUserId ? nameOf(f.ownerUserId) : null,
          amountMinor: f.amountMinor,
          needsReview: reasons.length > 0,
          reviewReason: reasons.length ? reviewReasonText(reasons) : null,
          edited: edited.has(f.id),
          deadline: dl
            ? {
                id: dl.id,
                state: hearingState(
                  dueState(dl.dueOn, clock.today, dl.status === "done"),
                  dl.dueOn,
                  clock.today,
                  time,
                  now,
                  clock.timezone,
                ),
                date: time
                  ? `${fmtDate(dl.dueOn, clock.locale)}, ${time.label}`
                  : fmtDate(dl.dueOn, clock.locale),
                iso: dl.dueOn,
                basis: dl.basis,
                windowEnd: dl.windowEndOn ? fmtDate(dl.windowEndOn, clock.locale) : null,
                windowBasis: detail?.windowBasis ?? null,
                warnings: detail?.warnings ?? [],
                receivedAssumed: detail?.receivedOnAssumed === true,
                status: dl.status,
              }
            : null,
        };
      });
    const summaryRow = fRows.find((r) => r.f.kind === "summary")?.f;

    // Stage history from the audit trail (each move is audited).
    const stageDetails: Partial<Record<Stage, string>> = {};
    const skipped = new Set<Stage>();
    const receivedHistory: CaseData["receivedHistory"] = [];
    const activity: CaseActivity[] = [];
    for (const a of auditRows) {
      const detail = (a.detail ?? {}) as Record<string, unknown>;
      if (a.action === "case.stage") {
        const to = detail.to as Stage;
        stageDetails[to] = fmtDate(a.at.toISOString().slice(0, 10), clock.locale).replace(
          / \d{4}$/,
          "",
        );
        if (detail.reason && detail.reason !== "Undone") {
          const order = [
            "received",
            "gathering",
            "drafting",
            "approval",
            "filed",
            "order",
            "appeal",
            "closed",
          ];
          const fi = order.indexOf(detail.from as string);
          const ti = order.indexOf(to);
          for (let i = fi + 1; i < ti; i++) skipped.add(order[i] as Stage);
        }
      }
      if (a.action === "document.received_date") {
        receivedHistory.push({
          from: fmtDate(detail.from as string, clock.locale),
          to: fmtDate(detail.to as string, clock.locale),
          reason: String(detail.reason ?? ""),
          by: nameOf(a.actor),
          at: fmtInstant(a.at, clock.timezone),
        });
      }
      const words = ACTION_WORDS[a.action];
      if (!words) continue;
      const isHistory = [
        "case.stage",
        "case.assign",
        "document.received_date",
        "deadline.correct",
        "deadline.recompute",
      ].includes(a.action);
      activity.push({
        id: `a${a.id}`,
        kind: isHistory ? "history" : "audit",
        actor: nameOf(a.actor),
        at: a.at.toISOString(),
        time: fmtInstant(a.at, clock.timezone),
        action: words,
        ...(a.action === "case.stage"
          ? {
              change: {
                from: STAGE_LABEL[detail.from as Stage] ?? String(detail.from),
                to: STAGE_LABEL[detail.to as Stage] ?? String(detail.to),
              },
            }
          : a.action === "case.assign"
            ? {
                change: {
                  from: detail.from ? nameOf(detail.from as string) : "Nobody",
                  to: detail.to ? nameOf(detail.to as string) : "Nobody",
                },
              }
            : a.action === "document.received_date" ||
                a.action === "deadline.correct" ||
                a.action === "deadline.recompute"
              ? {
                  change: {
                    from: fmtDate(detail.from as string, clock.locale),
                    to: fmtDate(detail.to as string, clock.locale),
                  },
                }
              : {}),
        ...(detail.reason ? { reason: String(detail.reason) } : {}),
      });
    }
    for (const cm of commentRows) {
      activity.push({
        id: cm.id,
        kind: "comment",
        actor: nameOf(cm.authorUserId),
        at: cm.createdAt.toISOString(),
        time: fmtInstant(cm.createdAt, clock.timezone),
        body: cm.body,
      });
    }
    for (const r of runRows) {
      // AI runs: what ran and how it went, never the text sent or returned.
      activity.push({
        id: r.id,
        kind: "ai",
        actor: "Dueproof AI",
        at: r.createdAt.toISOString(),
        time: fmtInstant(r.createdAt, clock.timezone),
        action: `ran ${r.feature.replaceAll("_", " ")} (${r.model}, ${r.outcome}, ${(r.inputTokens + r.outputTokens).toLocaleString("en-IN")} tokens)`,
      });
    }
    activity.sort((a, b) => a.at.localeCompare(b.at));

    const sectionWords = fRows
      .filter((r) => r.f.kind === "section")
      .map((r) => r.f.textEn ?? r.f.text);
    const amount =
      fRows.find((r) => r.f.kind === "amount" && r.f.amountMinor)?.f.amountMinor ?? null;
    const requester = c.stage === "approval" ? await approvalRequester(tx, ctx.orgId, c.id) : null;
    const resource = c.clientId ? { clientId: c.clientId } : {};
    const proof = notice
      ? await readProof(
          tx,
          ctx.orgId,
          notice.id,
          async (key) => (await storage.getSignedUrl(key)).url,
        )
      : null;

    const caseDemands: CaseDemand[] = demandRows.map((d) => {
      const inputs = (d.inputs ?? {}) as { dueOn?: string; asOf?: string; penaltyRule?: string };
      const comp = computeDemand(
        d.principalMinor,
        d.interestRule,
        inputs.penaltyRule ?? null,
        inputs,
        clock.locale,
      );
      return {
        id: d.id,
        taxType: d.taxType,
        head: d.head,
        status: d.status,
        principalMinor: d.principalMinor,
        interestRule: d.interestRule,
        penaltyRule: inputs.penaltyRule ?? null,
        dueOn: inputs.dueOn ?? null,
        asOf: inputs.asOf ?? null,
        asOfLabel: inputs.asOf ? fmtDate(inputs.asOf, clock.locale) : null,
        findingId: d.findingId,
        interestMinor: comp.interest?.amountMinor ?? d.interestMinor,
        penalty: comp.penalty ? { min: comp.penalty.lowMinor, max: comp.penalty.highMinor } : null,
        penaltyVerified: comp.penalty?.verified ?? true,
        workings: comp.interest?.workings ?? [],
        penaltyWorkings: comp.penalty?.workings ?? [],
        rateSource: comp.interest
          ? `${comp.interest.source.citation}. ${comp.interest.verified ? "Checked by a chartered accountant." : "Not yet checked by a chartered accountant."}`
          : null,
        warnings: [...(comp.interest?.warnings ?? [])],
        error: comp.error,
      };
    });

    const subject = {
      userId: ctx.userId,
      role: ctx.role,
      mayApproveReplies: ctx.mayApproveReplies,
    };
    return {
      id: c.id,
      title: c.title,
      typeLabel: [
        notice?.docType ? notice.docType.split(".").slice(1).join(" · ").toUpperCase() : null,
        c.title,
      ]
        .filter(Boolean)
        .join(" · "),
      authority: authorityOf(c.noticeType, c.authority),
      reference: c.reference,
      issuingOffice: c.authority ?? "Issuing office not read",
      stage: c.stage,
      stageDetails,
      skipped: [...skipped],
      client: client ? { id: client.id, name: client.name, gstin: client.gstins[0] ?? null } : null,
      owner: c.ownerUserId ? { id: c.ownerUserId, name: nameOf(c.ownerUserId) } : null,
      approvedBy: c.approvedByUserId ? nameOf(c.approvedByUserId) : null,
      approvalRequestedBy: requester ? { id: requester, name: nameOf(requester) } : null,
      filingRef: c.filingRef,
      filedOn: c.filedOn ? fmtDate(c.filedOn, clock.locale) : null,
      notice: notice ? toDoc(notice) : null,
      receivedHistory,
      documents: docs.map(toDoc),
      findings: caseFindings,
      summary: summaryRow
        ? {
            text: summaryRow.textEn ?? summaryRow.text,
            original: summaryRow.text,
            origin: summaryRow.origin,
          }
        : null,
      sections: sectionWords,
      amountMinor: amount,
      otherDeadlines: dRows
        .filter((d) => !d.findingId)
        .map((d) => ({
          id: d.id,
          title: d.title,
          state: dueState(d.dueOn, clock.today, d.status === "done"),
          date: fmtDate(d.dueOn, clock.locale),
          iso: d.dueOn,
          basis: d.basis,
          windowEnd: d.windowEndOn ? fmtDate(d.windowEndOn, clock.locale) : null,
          source: d.source,
          status: d.status,
        })),
      demands: caseDemands,
      activity,
      people,
      me: { id: ctx.userId, name: nameOf(ctx.userId) },
      today: clock.today,
      todayLabel: fmtDate(clock.today, clock.locale),
      languages: [...new Set(docs.flatMap((d) => d.languages))].filter((l) => l !== "en"),
      proof,
      can: {
        edit: can(subject, "case.edit", resource),
        assign: can(subject, "case.assign", resource),
        move: can(subject, "case.change_stage", resource),
        review: can(subject, "finding.review", resource),
        comment: can(subject, "case.comment", resource),
        upload: can(subject, "document.upload", resource),
        approve:
          c.stage === "approval" &&
          can(subject, "reply.approve", {
            ...resource,
            ...(requester ? { requestedBy: requester } : {}),
          }),
        editDeadlines: can(subject, "deadline.edit", resource),
        exposure: can(subject, "exposure.view", resource),
      },
    };
  });
}
