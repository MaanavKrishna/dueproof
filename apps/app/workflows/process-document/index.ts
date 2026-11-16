/**
 * processDocument (03 §6): inspect → read → (escalate) → (translate) →
 * analyze → link → ai_assist → reconcile → resolve dates → write findings,
 * evidence and deadlines. Each step records the document's status, so the
 * UI can follow along.
 *
 * Pages the OCR ladder leaves below the bar: with AI off (or the client
 * excluded from AI), hosted escalates them to engine-heavy in a Vercel
 * Sandbox (lib/heavy-engine.ts). With AI on they are the model's to read
 * (03 §6a rung 4); until its vision OCR lands they go to review.
 *
 * ai_assist (lib/pipeline/ai-assist.ts) runs a model only where the rules
 * aren't confident, within the org's budget and Opus cap; its findings,
 * graded by the linker, are reconciled with the rules' in packages/core.
 *
 * Start it with `start(processDocument, [{ orgId, documentId }])` from
 * "workflow/api" (lib/server/container.ts does this after an upload).
 */
import type { DocumentRef } from "../../lib/pipeline/types";
import {
  aiAssist,
  aiReadsPages,
  analyze,
  escalatePages,
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

    let read = await readPages(ref, inspected.pageCount);
    // Hosted: pages engine-fast couldn't read climb to engine-heavy (Sandbox),
    // unless the AI path reads them (03 §6a).
    if (read.canEscalate && read.needsEscalation.length && !(await aiReadsPages(ref)))
      read = await escalatePages(ref, read);
    const translations = read.needsTranslation ? await translate(ref, read.languages) : {};
    const analysis = await analyze(ref, translations);
    const link = await linkQuotes(ref, analysis);
    const ai = await aiAssist(ref, analysis, link, read.needsEscalation);
    const items = await reconcileFindings(ref, analysis, link, ai.findings);
    const dates = await resolveDates(ref, items, analysis.issuedOn);
    const written = await writeResults(ref, analysis, items, dates, read.needsEscalation, ai);
    return { status: written.status, findings: written.findings, deadlines: written.deadlines };
  } catch (e) {
    // Step errors arrive after retries are exhausted (or at once for FatalError).
    const reason =
      e instanceof Error && e.message && e.message.length <= 64 ? e.message : "processing_error";
    await markFailed(ref, reason);
    return { status: "failed", reason };
  }
}
