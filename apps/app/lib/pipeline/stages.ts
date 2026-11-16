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
import type { DateRule, ResolvedDate } from "@dueproof/contracts";
import {
  and,
  asc,
  audit,
  deadlines,
  documents,
  eq,
  evidence,
  findings,
  holidays,
  orgSettings,
  pages,
  uuidv7,
  withOrg,
} from "@dueproof/db";
import type { AnalyzeResponse, LinkResponse, PageText } from "@dueproof/engine-client";
import { orgKey } from "@dueproof/storage";
import { type Reconciled, reconcile, resolveDate } from "../core-adapter";
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

type Finding = AnalyzeResponse["findings"][number];

export async function reconcileStage(
  c: Container,
  ref: DocumentRef,
  analysis: AnalyzeResponse,
  link: LinkResponse,
): Promise<Reconciled<Finding>[]> {
  await setStatus(c.database, ref.orgId, ref.documentId, "reconciling");
  return reconcile(analysis.findings, link.matches, quoteId);
}

// ---------------------------------------------------------------- resolve dates

export type DateOutcome =
  | { index: number; resolved: ResolvedDate }
  | { index: number; error: string };

export async function resolveDatesStage(
  c: Container,
  ref: DocumentRef,
  items: Reconciled<Finding>[],
  issuedOn: string | undefined,
): Promise<DateOutcome[]> {
  const doc = await loadDocument(c, ref);
  const { days, workingDays } = await withOrg(c.database, ref.orgId, async (tx) => {
    const [settings] = await tx
      .select()
      .from(orgSettings)
      .where(eq(orgSettings.orgId, ref.orgId))
      .limit(1);
    const rows = await tx
      .select({ day: holidays.day })
      .from(holidays)
      .where(eq(holidays.orgId, ref.orgId));
    return {
      days: rows.map((r) => r.day),
      workingDays: settings?.workingDays ?? [1, 2, 3, 4, 5, 6],
    };
  });
  const anchors = {
    ...(doc.receivedOn ? { receipt: doc.receivedOn } : {}),
    ...(issuedOn ? { issue: issuedOn } : {}),
  };
  const out: DateOutcome[] = [];
  items.forEach((item, index) => {
    const rule = item.finding.dueRule as DateRule | undefined;
    if (!rule) return;
    const r = resolveDate(rule, { anchors, holidays: days, workingDays });
    out.push("error" in r ? { index, error: r.error } : { index, resolved: r });
  });
  return out;
}

// ---------------------------------------------------------------- write

export interface WriteResult {
  status: "ready" | "needs_review";
  findings: number;
  deadlines: number;
  skipped: boolean;
}

export async function writeStage(
  c: Container,
  ref: DocumentRef,
  analysis: AnalyzeResponse,
  items: Reconciled<Finding>[],
  dates: DateOutcome[],
  needsEscalation: number[],
): Promise<WriteResult> {
  const doc = await loadDocument(c, ref);
  const dateByIndex = new Map(dates.map((d) => [d.index, d]));
  const unlocated = items.some((i) => i.verification === "unlocated");
  const dateErrors = dates.some((d) => "error" in d);
  const status: WriteResult["status"] =
    analysis.confident && !unlocated && !dateErrors && !needsEscalation.length && items.length
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
    for (const [ord, item] of items.entries()) {
      const f = item.finding;
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
        origin: "rule",
        verification: item.verification,
        confidence: f.confidence,
        dueRule: f.dueRule ?? null,
        amountMinor: f.amountMinor ?? null,
        desk: f.desk ?? null,
        severity: f.severity ?? null,
      });
      if (item.match?.page !== undefined) {
        await tx.insert(evidence).values({
          id: uuidv7(),
          orgId: ref.orgId,
          findingId,
          documentId: ref.documentId,
          page: item.match.page,
          rects: item.match.rects,
          score: item.match.score,
        });
      }
      const date = dateByIndex.get(ord);
      // The page is the proof: an unlocated finding never becomes a deadline unconfirmed.
      if (date && "resolved" in date && item.verification !== "unlocated") {
        await tx.insert(deadlines).values({
          id: uuidv7(),
          orgId: ref.orgId,
          clientId: doc.clientId,
          caseId: doc.caseId,
          findingId,
          source: doc.role === "order" ? "order" : "notice",
          title: f.text.slice(0, 200),
          dueOn: date.resolved.dueOn,
          windowEndOn: date.resolved.windowEndOn ?? null,
          rule: date.resolved.rule,
          basis: date.resolved.basis,
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
      detail: { status, findings: items.length, deadlines: deadlineCount },
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
