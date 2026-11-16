/**
 * Labelled cases for the eval. Each case joins:
 *  - the engine lane's recorded responses (services/engine/fixtures/recorded):
 *    page text and words (`read`), rule findings (`analyze`) and their link grades;
 *  - the hand labels (services/engine/tests/fixtures/labels.jsonl);
 *  - the demo's golden output (services/engine/tests/golden.json), used only for
 *    the document date when analyze has none;
 *  - extra labels kept with the eval (evals/data/labels-extra.jsonl): amounts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DateContext, GradedFinding } from "../../packages/core/src/index";
import {
  type EngineRecording,
  gradedRuleFindings,
  loadEngineRecording,
  REPO_ROOT,
} from "../../packages/ai/src/testing/fixtures";

export interface LabelObligation {
  quote: string;
  due_date?: string;
  desks?: string[];
}

export interface LabelAmount {
  quote: string;
  minor: number;
}

export interface EvalCase {
  /** Recording name, e.g. "notice-gst-asmt10". */
  key: string;
  file: string;
  recording: EngineRecording;
  ruleFindings: GradedFinding[];
  obligations: LabelObligation[];
  notObligations: string[];
  amounts: LabelAmount[];
  dateContext: DateContext;
  /** Tags for the per-type breakdown: digital/scan, languages. */
  tags: string[];
}

export const EVALS_DIR = join(REPO_ROOT, "evals");
const LABELS = join(REPO_ROOT, "services", "engine", "tests", "fixtures", "labels.jsonl");
const GOLDEN = join(REPO_ROOT, "services", "engine", "tests", "golden.json");
const EXTRA = join(EVALS_DIR, "data", "labels-extra.jsonl");

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => JSON.parse(l) as T);
}

interface LabelRow {
  file: string;
  received_on?: string;
  obligations: LabelObligation[];
  not_obligations?: string[];
}

export function loadCases(only?: readonly string[]): EvalCase[] {
  const labels = readJsonl<LabelRow>(LABELS);
  const extra = new Map(
    readJsonl<{ file: string; amounts?: LabelAmount[] }>(EXTRA).map((r) => [r.file, r]),
  );
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, { doc_date?: string }>;
  const cases: EvalCase[] = [];
  for (const row of labels) {
    const key = row.file.replace(/\.pdf$/i, "");
    if (only && only.length > 0 && !only.includes(key)) continue;
    const recording = loadEngineRecording(key);
    const issue = recording.analyze.issuedOn ?? golden[row.file]?.doc_date;
    const anchors: DateContext["anchors"] = {};
    if (row.received_on) anchors.receipt = row.received_on;
    if (issue) anchors.issue = issue;
    const pages = recording.read.pages;
    const tags = [
      pages.every((p) => p.engine === "text_layer") ? "digital" : "scan",
      ...new Set(pages.flatMap((p) => p.languages)),
    ];
    cases.push({
      key,
      file: row.file,
      recording,
      ruleFindings: gradedRuleFindings(recording),
      obligations: row.obligations,
      notObligations: row.not_obligations ?? [],
      amounts: extra.get(row.file)?.amounts ?? [],
      dateContext: { anchors, holidays: [], workingDays: [1, 2, 3, 4, 5, 6] },
      tags,
    });
  }
  return cases;
}

export interface RecordingFile {
  note?: string;
  source: "synthetic" | "live";
  model?: string;
  recordedAt?: string;
  latencyMs?: number;
  stop?: "end" | "refusal" | "max_tokens" | "other";
  json?: unknown;
  text?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}

export function recordingPath(level: string, key: string): string {
  return join(EVALS_DIR, "recordings", level, `${key}.json`);
}

export function loadRecordingFile(level: string, key: string): RecordingFile | undefined {
  try {
    return JSON.parse(readFileSync(recordingPath(level, key), "utf8")) as RecordingFile;
  } catch {
    return undefined;
  }
}
