/**
 * The work behind each processDocument step (03 §6). Plain async functions
 * over the container, so they're unit-testable without the workflow
 * runtime. Every stage is idempotent: a retried or resumed step repeats it
 * safely. Each stage records its status (document row + document_events)
 * and announces it for live updates.
 *
 * Data that crosses steps is kept small: page text and words live in the
 * `pages` table, not in step results.
 */
import "server-only";
import {
  type DateContext,
  type DateError,
  type GradedFinding,
  isDateError,
  type ReconciledFinding,
  type ReconcileResult,
  type ResolvedDateDetail,
  reconcile,
  resolveDate,
} from "@dueproof/core";
import {
  and,
  asc,
  audit,
  count,
  deadlines,
  documents,
  eq,
  evidence,
  findings,
  ne,
  pages,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import type { AnalyzeResponse, LinkResponse, PageText } from "@dueproof/engine-client";
import { orgKey } from "@dueproof/storage";
import { loadOrgCalendar } from "../calendar";
import type { DeadlineDetail } from "../deadline-detail";
import type { Container } from "../server/container";
import { announce, setStatus, writeStatus } from "./status";
import type { DocumentRef } from "./types";

export const MAX_PAGES = 500;

/** Thrown for problems a retry can't fix (the workflow turns it into FatalError). */
export class PermanentError extends Error {
  override name = "PermanentError";
  constructor(readonly reason: string) {
    super(reason);
  }
}

async function loadDocument(c: Container, ref: DocumentRef) {
  const doc = await withOrg(c.database, ref.orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.orgId, ref.orgId), eq(documents.id, ref.documentId)))
      .limit(1);
    return row;
  });
  if (!doc) throw new PermanentError("document_missing");
  return doc;
}

async function loadPages(c: Container, ref: DocumentRef): Promise<PageText[]> {
  const rows = await withOrg(c.database, ref.orgId, (tx) =>
    tx
      .select()
      .from(pages)
      .where(and(eq(pages.orgId, ref.orgId), eq(pages.documentId, ref.documentId)))
      .orderBy(asc(pages.page)),
  );
  return rows.map((p) => ({
    page: p.page,
    width: p.width,
    height: p.height,
    rotation: 0,
    text: p.text,
    words: p.words as PageText["words"],
    engine: (p.engine ?? "none") as PageText["engine"],
    confidence: p.confidence ?? 0,
    languages: [],
  }));
}

const engineMime = (mime: string) =>
  mime as "application/pdf" | "image/jpeg" | "image/png" | "image/tiff";

// ---------------------------------------------------------------- inspect

export interface InspectResult {
  ok: boolean;
  pageCount: number;
  reason?: string;
}

export async function inspectStage(c: Container, ref: DocumentRef): Promise<InspectResult> {
  await setStatus(c.database, ref.orgId, ref.documentId, "reading", "inspect");
  const doc = await loadDocument(c, ref);
  const source = await c.engineStorage.getSignedUrl(doc.storageKey);
  const res = await c.engine.inspect({ sourceUrl: source.url, mime: engineMime(doc.mime) });
  if (!res.ok) {
    const reason = res.encrypted ? "needs_password" : (res.reason ?? "unreadable");
    return { ok: false, pageCount: res.pageCount, reason };
  }
  if (res.pageCount > MAX_PAGES)
    return { ok: false, pageCount: res.pageCount, reason: "too_many_pages" };
  if (res.pageCount === 0) return { ok: false, pageCount: 0, reason: "no_pages" };
  return { ok: true, pageCount: res.pageCount };
}

// ---------------------------------------------------------------- read

export interface ReadResult {
  pageCount: number;
  languages: string[];
  needsTranslation: boolean;
  needsEscalation: number[];
}

export async function readStage(
  c: Container,
  ref: DocumentRef,
  pageCount: number,
): Promise<ReadResult> {
  await setStatus(c.database, ref.orgId, ref.documentId, "reading", "read");
  const doc = await loadDocument(c, ref);
  const source = await c.engineStorage.getSignedUrl(doc.storageKey);
  const imageKeys = Array.from({ length: pageCount }, (_, i) =>
    orgKey(ref.orgId, "documents", ref.documentId, "pages", `${i + 1}.webp`),
  );
  const putUrls = await Promise.all(
    imageKeys.map((k) => c.engineStorage.putSignedUrl(k, { contentType: "image/webp" })),
  );
  const res = await c.engine.read({
    sourceUrl: source.url,
    mime: engineMime(doc.mime),
    pageImagePutUrls: putUrls.map((u) => u.url),
    languages: ["en"],
    maxRung: c.env.ENGINE_MAX_RUNG,
  });

  const languages = [...new Set(res.pages.flatMap((p) => p.languages))];
  await withOrg(c.database, ref.orgId, async (tx) => {
    for (const p of res.pages) {
      const values = {
        orgId: ref.orgId,
        documentId: ref.documentId,
        page: p.page,
        width: p.width,
        height: p.height,
        imageKey: imageKeys[p.page - 1] ?? null,
        text: p.text,
        words: p.words,
        engine: p.engine,
        confidence: p.confidence,
      };
      await tx
        .insert(pages)
        .values(values)
        .onConflictDoUpdate({ target: [pages.orgId, pages.documentId, pages.page], set: values });
    }
    await tx
      .update(documents)
      .set({ pageCount: res.pages.length, languages })
      .where(and(eq(documents.orgId, ref.orgId), eq(documents.id, ref.documentId)));
  });

  return {
    pageCount: res.pages.length,
    languages,
    needsTranslation: languages.some((l) => l !== "en"),
    needsEscalation: res.needsEscalation,
  };
}

// ---------------------------------------------------------------- translate

export async function translateStage(
  c: Container,
  ref: DocumentRef,
  languages: string[],
): Promise<Record<string, string>> {
  await setStatus(c.database, ref.orgId, ref.documentId, "translating");
  const lang = languages.find((l) => l !== "en") ?? "en";
  const segments = (await loadPages(c, ref)).flatMap((p) => {
    const lines = new Map<number, string[]>();
    for (const w of p.words) lines.set(w.line, [...(lines.get(w.line) ?? []), w.text]);
    return [...lines].map(([line, ws]) => ({ id: `${p.page}:${line}`, text: ws.join(" "), lang }));
  });
  if (!segments.length) return {};
  const res = await c.engine.translate({ segments });
  return Object.fromEntries(res.segments.map((s) => [s.id, s.textEn]));
}

// ---------------------------------------------------------------- analyze

export async function analyzeStage(
  c: Container,
  ref: DocumentRef,
  translations: Record<string, string>,
): Promise<AnalyzeResponse> {
  await setStatus(c.database, ref.orgId, ref.documentId, "extracting");
  const doc = await loadDocument(c, ref);
  const res = await c.engine.analyze({
    pages: await loadPages(c, ref),
    translations,
    ...(doc.receivedOn ? { receivedOn: doc.receivedOn } : {}),
  });
  await withOrg(c.database, ref.orgId, (tx) =>
    tx
      .update(documents)
      .set({
        docType: res.docType ?? null,
        title: res.title ?? null,
        reference: res.reference ?? null,
        issuingOffice: res.issuingOffice ?? null,
        issuedOn: res.issuedOn ?? null,
      })
      .where(and(eq(documents.orgId, ref.orgId), eq(documents.id, ref.documentId))),
  );
  return res;
}

// ---------------------------------------------------------------- link

export const quoteId = (i: number) => `q${i}`;

export async function linkStage(
  c: Container,
  ref: DocumentRef,
  analysis: AnalyzeResponse,
): Promise<LinkResponse> {
  await setStatus(c.database, ref.orgId, ref.documentId, "linking");
  if (!analysis.findings.length) return { matches: [] };
  return c.engine.link({
    pages: await loadPages(c, ref),
    quotes: analysis.findings.map((f, i) => ({
      id: quoteId(i),
      text: f.quote,
      ...(f.pageHint ? { pageHint: f.pageHint } : {}),
    })),
  });
}

// ---------------------------------------------------------------- reconcile

/** A graded finding plus where the linker found its quote, so evidence can be written. */
export interface ProvenFinding extends GradedFinding {
  rects: [number, number, number, number][];
  score: number;
}

/**
 * Rule findings from analyze, graded by the linker. Exact duplicates (same
 * kind and quote) are dropped. A finding is located only when the linker
 * placed it on a page with at least one box (AGENTS rule 3).
 */
export function gradeRuleFindings(analysis: AnalyzeResponse, link: LinkResponse): ProvenFinding[] {
  const byId = new Map(link.matches.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const out: ProvenFinding[] = [];
  analysis.findings.forEach((finding, i) => {
    const key = `${finding.kind}\u0000${finding.quote.trim().toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const id = quoteId(i);
    const m = byId.get(id);
    if (m && m.grade !== "unlocated" && m.page !== undefined && m.rects.length > 0) {
      out.push({ id, finding, grade: m.grade, page: m.page, rects: m.rects, score: m.score });
    } else {
      out.push({ id, finding, grade: "unlocated", rects: [], score: m?.score ?? 0 });
    }
  });
  return out;
}

export type ReconcileOutcome = ReconcileResult;

/**
 * Deterministic reconciliation (04 §4) through `@dueproof/core`.
 *
 * `aiFindings` is the AI lane's hook: when assisted extraction runs (04 §3),
 * pass its findings here, already graded by the linker, with ids that don't
 * clash with the rule findings' `q<n>` (e.g. `ai<n>`). Until then it is
 * empty and every finding is origin `rule`.
 */
export async function reconcileStage(
  c: Container,
  ref: DocumentRef,
  analysis: AnalyzeResponse,
  link: LinkResponse,
  aiFindings: ProvenFinding[] = [],
): Promise<ReconcileOutcome> {
  await setStatus(c.database, ref.orgId, ref.documentId, "reconciling");
  const dateContext = await loadDateContext(c, ref, analysis.issuedOn);
  const aiReviewedSoFar = aiFindings.length ? await aiReviewedCount(c, ref.orgId) : 0;
  return reconcile(gradeRuleFindings(analysis, link), aiFindings, {
    aiReviewedSoFar,
    dateContext,
  });
}

/**
 * How many AI-only located findings the organisation has had so far. Core
 * flags the first N of them for review; counting the rows written gives the
 * same answer as a stored counter while it is below N, with no extra state
 * to keep in step.
 */
async function aiReviewedCount(c: Container, orgId: string): Promise<number> {
  const [row] = await withOrg(c.database, orgId, (tx) =>
    tx
      .select({ n: count() })
      .from(findings)
      .where(
        and(
          eq(findings.orgId, orgId),
          eq(findings.origin, "ai"),
          ne(findings.verification, "unlocated"),
        ),
      ),
  );
  return Number(row?.n ?? 0);
}

// ---------------------------------------------------------------- resolve dates

async function loadDateContext(
  c: Container,
  ref: DocumentRef,
  issuedOn: string | undefined,
): Promise<DateContext> {
  const doc = await loadDocument(c, ref);
  const cal = await loadOrgCalendar(c, ref.orgId);
  return {
    anchors: {
      ...(doc.receivedOn ? { receipt: doc.receivedOn } : {}),
      ...(issuedOn ? { issue: issuedOn } : {}),
    },
    holidays: cal.holidays,
    workingDays: cal.workingDays,
    locale: cal.locale,
  };
}

export type DateOutcome =
  | { id: string; resolved: ResolvedDateDetail }
  | { id: string; error: DateError };

/** Dates for the findings that may become deadlines now (`deadline: "auto"`). */
export async function resolveDatesStage(
  c: Container,
  ref: DocumentRef,
  reconciled: ReconcileOutcome,
  issuedOn: string | undefined,
): Promise<DateOutcome[]> {
  const ctx = await loadDateContext(c, ref, issuedOn);
  const out: DateOutcome[] = [];
  for (const f of reconciled.findings) {
    if (f.deadline !== "auto" || !f.dueRule) continue;
    const r = resolveDate(f.dueRule, ctx);
    out.push(isDateError(r) ? { id: f.id, error: r } : { id: f.id, resolved: r });
  }
  return out;
}

// ---------------------------------------------------------------- write

export interface WriteResult {
  status: "ready" | "needs_review";
  findings: number;
  deadlines: number;
  skipped: boolean;
}

/** The source (rule first, then AI) whose located quote is the finding's proof. */
function proofOf(f: ReconciledFinding): ProvenFinding | undefined {
  for (const s of [f.ruleSource, f.aiSource] as (ProvenFinding | undefined)[]) {
    if (
      s &&
      s.grade !== "unlocated" &&
      s.page !== undefined &&
      s.page === f.page &&
      s.rects?.length
    )
      return s;
  }
  return undefined;
}

export async function writeStage(
  c: Container,
  ref: DocumentRef,
  analysis: AnalyzeResponse,
  reconciled: ReconcileOutcome,
  dates: DateOutcome[],
  needsEscalation: number[],
): Promise<WriteResult> {
  const doc = await loadDocument(c, ref);
  const items = reconciled.findings;
  const dateById = new Map(dates.map((d) => [d.id, d]));
  // `after_review` means a proposed date waits for a person: the document needs review.
  const review = items.some((f) => f.needsReview || f.deadline === "after_review");
  const dateErrors = dates.some((d) => "error" in d);
  const status: WriteResult["status"] =
    analysis.confident && !review && !dateErrors && !needsEscalation.length && items.length
      ? "ready"
      : "needs_review";

  const result = await withOrg(c.database, ref.orgId, async (tx, scope) => {
    const [already] = await tx
      .select({ id: findings.id })
      .from(findings)
      .where(and(eq(findings.orgId, ref.orgId), eq(findings.documentId, ref.documentId)))
      .limit(1);
    if (already) {
      // A previous attempt committed; this is a retry after the commit.
      return { findings: 0, deadlines: 0, skipped: true };
    }

    let deadlineCount = 0;
    for (const [ord, f] of items.entries()) {
      const source = (f.ruleSource ?? f.aiSource)?.finding;
      const findingId = uuidv7();
      await tx.insert(findings).values({
        id: findingId,
        orgId: ref.orgId,
        documentId: ref.documentId,
        caseId: doc.caseId,
        kind: f.kind,
        ord,
        text: f.text,
        textEn: f.textEn ?? null,
        quote: f.quote,
        quoteLang: f.quoteLang,
        origin: f.origin,
        verification: f.grade,
        confidence: f.confidence,
        dueRule: f.dueRule ?? null,
        amountMinor: f.amountMinor ?? null,
        desk: source?.desk ?? null,
        severity: source?.severity ?? null,
      });
      const proof = proofOf(f);
      if (proof?.page !== undefined) {
        await tx.insert(evidence).values({
          id: uuidv7(),
          orgId: ref.orgId,
          findingId,
          documentId: ref.documentId,
          page: proof.page,
          rects: proof.rects,
          score: proof.score,
        });
      }
      // Only `auto` becomes a deadline now. `after_review` waits until a person
      // confirms the finding; `never` (unverified AI suggestion) and `none` never do.
      const date = dateById.get(f.id);
      if (f.deadline === "auto" && date && "resolved" in date) {
        const r = date.resolved;
        const detail: DeadlineDetail = {
          adjustments: r.adjustments,
          warnings: r.warnings,
          ...(r.windowBasis ? { windowBasis: r.windowBasis } : {}),
          ...(r.originalDueOn ? { originalDueOn: r.originalDueOn } : {}),
          inputs: r.inputs,
          origin: f.origin,
          verification: f.grade,
        };
        await tx.insert(deadlines).values({
          id: uuidv7(),
          orgId: ref.orgId,
          clientId: doc.clientId,
          caseId: doc.caseId,
          findingId,
          source: doc.role === "order" ? "order" : "notice",
          title: f.text.slice(0, 200),
          dueOn: r.dueOn,
          windowEndOn: r.windowEndOn ?? null,
          rule: r.rule,
          basis: r.basis,
          detail: { ...detail },
        });
        deadlineCount += 1;
      }
    }
    const detail = `${items.length} findings, ${deadlineCount} deadlines`;
    await writeStatus(tx, ref.orgId, ref.documentId, status, detail);
    await audit.write(tx, scope, {
      actor: null,
      action: "document.processed",
      targetType: "document",
      targetId: ref.documentId,
      detail: {
        status,
        findings: items.length,
        deadlines: deadlineCount,
        aiFirstNUsed: reconciled.aiFirstNUsed,
      },
    });
    return { findings: items.length, deadlines: deadlineCount, skipped: false };
  });
  if (!result.skipped)
    announce(
      ref.orgId,
      ref.documentId,
      status,
      `${result.findings} findings, ${result.deadlines} deadlines`,
    );
  return { status, ...result };
}

// ---------------------------------------------------------------- failure

export async function failStage(c: Container, ref: DocumentRef, reason: string): Promise<void> {
  // Reasons are short codes (needs_password, engine_error, …), never document text.
  const code = reason.replace(/[^a-z0-9_]/gi, "_").slice(0, 64);
  // An encrypted PDF isn't a failure: it waits for its password (asked again on each read, 05 §4).
  const status = code === "needs_password" ? "needs_password" : "failed";
  await withOrg(c.database, ref.orgId, async (tx, scope) => {
    await writeStatus(tx, ref.orgId, ref.documentId, status, code);
    await audit.write(tx, scope, {
      actor: null,
      action: status === "failed" ? "document.failed" : "document.needs_password",
      targetType: "document",
      targetId: ref.documentId,
      detail: { reason: code },
    });
  });
  announce(ref.orgId, ref.documentId, status, code);
}
