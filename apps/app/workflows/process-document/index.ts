/**
 * processDocument (03 §6): inspect → read → (translate) → analyze → link →
 * reconcile → resolve dates → write findings, evidence and deadlines. Each
 * step records the document's status, so the UI can follow along.
 *
 * Start it with `start(processDocument, [{ orgId, documentId }])` from
 * "workflow/api" (lib/server/container.ts does this after an upload).
 * The AI assist step (04) slots in after analyze when packages/ai lands.
 */
import type { DocumentRef } from "../../lib/pipeline/types";
import {
  analyze,
  inspect,
  linkQuotes,
  markFailed,
  readPages,
  reconcileFindings,
  resolveDates,
  translate,
  writeResults,
} from "./steps";

export type ProcessDocumentResult =
  | { status: "ready" | "needs_review"; findings: number; deadlines: number }
  | { status: "failed"; reason: string };

export async function processDocument(ref: DocumentRef): Promise<ProcessDocumentResult> {
  "use workflow";

  try {
    const inspected = await inspect(ref);
    if (!inspected.ok) {
      const reason = inspected.reason ?? "unreadable";
      await markFailed(ref, reason);
      return { status: "failed", reason };
    }

    const read = await readPages(ref, inspected.pageCount);
    const translations = read.needsTranslation ? await translate(ref, read.languages) : {};
    const analysis = await analyze(ref, translations);
    const link = await linkQuotes(ref, analysis);
    const items = await reconcileFindings(ref, analysis, link);
    const dates = await resolveDates(ref, items, analysis.issuedOn);
    const written = await writeResults(ref, analysis, items, dates, read.needsEscalation);
    return { status: written.status, findings: written.findings, deadlines: written.deadlines };
  } catch (e) {
    // Step errors arrive after retries are exhausted (or at once for FatalError).
    const reason =
      e instanceof Error && e.message && e.message.length <= 64 ? e.message : "processing_error";
    await markFailed(ref, reason);
    return { status: "failed", reason };
  }
}
