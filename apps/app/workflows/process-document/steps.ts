/**
 * processDocument's steps. Each runs with full Node access, is retried with
 * backoff by the Workflow runtime, and is idempotent. Heavy modules are
 * imported inside the step body so the workflow bundle (which only
 * orchestrates) never pulls in the database, storage or engine code.
 *
 * Errors a retry can't fix become FatalError: a missing document, an
 * unreadable file, or an engine answer that breaks the contract.
 */
import type { AnalyzeResponse, LinkResponse } from "@dueproof/engine-client";
import { FatalError } from "workflow";
import type {
  DateOutcome,
  InspectResult,
  ReadResult,
  ReconcileOutcome,
  WriteResult,
} from "../../lib/pipeline/stages";
import type { DocumentRef } from "../../lib/pipeline/types";

async function deps() {
  const [{ getContainer }, stages] = await Promise.all([
    import("../../lib/server/container"),
    import("../../lib/pipeline/stages"),
  ]);
  return { c: await getContainer(), stages };
}

function classify(e: unknown): never {
  const err = e as { name?: string; retryable?: boolean; reason?: string; message?: string };
  if (err?.name === "PermanentError") throw new FatalError(err.reason ?? "permanent");
  if (err?.name === "EngineError" && err.retryable === false) throw new FatalError("engine_error");
  throw e;
}

export async function inspect(ref: DocumentRef): Promise<InspectResult> {
  "use step";
  const { c, stages } = await deps();
  return stages.inspectStage(c, ref).catch(classify);
}

export async function readPages(ref: DocumentRef, pageCount: number): Promise<ReadResult> {
  "use step";
  const { c, stages } = await deps();
  return stages.readStage(c, ref, pageCount).catch(classify);
}

export async function escalatePages(ref: DocumentRef, read: ReadResult): Promise<ReadResult> {
  "use step";
  const { c, stages } = await deps();
  return stages.escalateStage(c, ref, read).catch(classify);
}

export async function translate(
  ref: DocumentRef,
  languages: string[],
): Promise<Record<string, string>> {
  "use step";
  const { c, stages } = await deps();
  return stages.translateStage(c, ref, languages).catch(classify);
}

export async function analyze(
  ref: DocumentRef,
  translations: Record<string, string>,
): Promise<AnalyzeResponse> {
  "use step";
  const { c, stages } = await deps();
  return stages.analyzeStage(c, ref, translations).catch(classify);
}

export async function linkQuotes(
  ref: DocumentRef,
  analysis: AnalyzeResponse,
): Promise<LinkResponse> {
  "use step";
  const { c, stages } = await deps();
  return stages.linkStage(c, ref, analysis).catch(classify);
}

type Items = ReconcileOutcome;

export async function reconcileFindings(
  ref: DocumentRef,
  analysis: AnalyzeResponse,
  link: LinkResponse,
): Promise<Items> {
  "use step";
  const { c, stages } = await deps();
  return stages.reconcileStage(c, ref, analysis, link).catch(classify);
}

export async function resolveDates(
  ref: DocumentRef,
  items: Items,
  issuedOn: string | undefined,
): Promise<DateOutcome[]> {
  "use step";
  const { c, stages } = await deps();
  return stages.resolveDatesStage(c, ref, items, issuedOn).catch(classify);
}

export async function writeResults(
  ref: DocumentRef,
  analysis: AnalyzeResponse,
  items: Items,
  dates: DateOutcome[],
  needsEscalation: number[],
): Promise<WriteResult> {
  "use step";
  const { c, stages } = await deps();
  return stages.writeStage(c, ref, analysis, items, dates, needsEscalation).catch(classify);
}

export async function markFailed(ref: DocumentRef, reason: string): Promise<void> {
  "use step";
  const { c, stages } = await deps();
  await stages.failStage(c, ref, reason);
}
