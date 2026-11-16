/**
 * Audit export (08 §1, Business): the organisation's audit trail as JSONL or
 * CSV, with its hash chain, and a verification report that lets anyone check
 * the file without Dueproof.
 *
 * Each row's hash is sha256 of the canonical JSON of
 *   { orgId, at, actor, action, targetType, targetId, requestId, detail, prevHash }
 * (keys sorted, no spaces; packages/db/src/audit.ts). Rows link through
 * prevHash. The export checks the chain from the organisation's first entry
 * to the end of the range, so a range starting mid-way is still anchored:
 * the report gives the hash the first exported row links to.
 *
 * JSONL is the verifiable format. CSV is for reading in a spreadsheet: values
 * that would start a formula are prefixed with ', which the report says.
 */
import { createHash } from "node:crypto";
import { auditHash } from "@dueproof/db";
import type {
  AuditExportExtension,
  AuditExportFormat,
  AuditExportResult,
  AuditExportRow,
  AuditVerificationReport,
} from "@dueproof/plugins";

const HOW_TO_VERIFY =
  "Read the JSONL file in order. For each line, compute sha256 over the canonical JSON " +
  "(keys sorted, no whitespace, `at` as an ISO 8601 string) of {orgId, at, actor, action, " +
  "targetType, targetId, requestId, detail, prevHash}; it must equal `hash`. Each line's " +
  "`prevHash` must equal the previous line's `hash`; the first line's must equal `anchorHash`. " +
  "The file's sha256 must equal `fileSha256`. CSV values that would start a spreadsheet " +
  "formula (= + - @) are prefixed with ' and cannot be verified from the CSV; use the JSONL.";

interface ExportLine {
  id: number;
  orgId: string;
  at: string;
  actor: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  requestId: string | null;
  detail: unknown;
  prevHash: string | null;
  hash: string;
}

function rowHash(r: Omit<ExportLine, "id" | "hash"> | AuditExportRow): string {
  return auditHash({
    orgId: r.orgId,
    at: r.at instanceof Date ? r.at : new Date(r.at),
    actor: r.actor,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    requestId: r.requestId,
    detail: r.detail ?? null,
    prevHash: r.prevHash,
  });
}

/** Walks the chain from its start; the first row whose hash or link is wrong. */
export function checkChain(rows: readonly AuditExportRow[]): {
  ok: boolean;
  checked: number;
  brokenAt: number | null;
} {
  let prev: string | null = null;
  for (const row of rows) {
    if (row.prevHash !== prev || row.hash !== rowHash(row))
      return { ok: false, checked: rows.length, brokenAt: row.id };
    prev = row.hash;
  }
  return { ok: true, checked: rows.length, brokenAt: null };
}

function toLine(r: AuditExportRow): ExportLine {
  return {
    id: r.id,
    orgId: r.orgId,
    at: r.at.toISOString(),
    actor: r.actor,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    requestId: r.requestId,
    detail: r.detail ?? null,
    prevHash: r.prevHash,
    hash: r.hash,
  };
}

const CSV_COLUMNS = [
  "id",
  "at",
  "actor",
  "action",
  "target_type",
  "target_id",
  "request_id",
  "detail",
  "prev_hash",
  "hash",
] as const;

function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(lines: readonly ExportLine[]): string {
  const out = [CSV_COLUMNS.join(",")];
  for (const l of lines) {
    out.push(
      [
        l.id,
        l.at,
        l.actor,
        l.action,
        l.targetType,
        l.targetId,
        l.requestId,
        l.detail === null ? "" : JSON.stringify(l.detail),
        l.prevHash,
        l.hash,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${out.join("\r\n")}\r\n`;
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const day = (d: Date) => d.toISOString().slice(0, 10);

export function buildAuditExport(input: {
  orgId: string;
  chain: AuditExportRow[];
  from: Date | null;
  to: Date | null;
  format: AuditExportFormat;
  now: Date;
}): AuditExportResult {
  const chain = [...input.chain].sort((a, b) => a.id - b.id);
  const inRange = chain.filter(
    (r) =>
      (!input.from || r.at.getTime() >= input.from.getTime()) &&
      (!input.to || r.at.getTime() <= input.to.getTime()),
  );
  // Only rows up to the end of the range belong to the chain being checked.
  const lastId = inRange.at(-1)?.id ?? null;
  const checked = lastId === null ? chain : chain.filter((r) => r.id <= lastId);
  const lines = inRange.map(toLine);
  const body =
    input.format === "jsonl"
      ? lines.map((l) => JSON.stringify(l)).join("\n") + (lines.length ? "\n" : "")
      : toCsv(lines);
  const report: AuditVerificationReport = {
    format: "dueproof-audit-verification",
    version: 1,
    orgId: input.orgId,
    generatedAt: input.now.toISOString(),
    range: { from: input.from?.toISOString() ?? null, to: input.to?.toISOString() ?? null },
    count: lines.length,
    firstId: lines[0]?.id ?? null,
    lastId,
    anchorHash: lines[0]?.prevHash ?? null,
    lastHash: lines.at(-1)?.hash ?? null,
    chain: checkChain(checked),
    fileSha256: sha256(body),
    fileFormat: input.format,
    howToVerify: HOW_TO_VERIFY,
  };
  const span = [input.from ? day(input.from) : "start", input.to ? day(input.to) : day(input.now)];
  return {
    filename: `dueproof-audit-${span.join("-to-")}.${input.format}`,
    contentType: input.format === "jsonl" ? "application/x-ndjson" : "text/csv; charset=utf-8",
    body,
    report,
  };
}

/**
 * Checks an exported JSONL file against its report, the way a customer's
 * auditor would. Returns the first problem, or null when everything holds.
 */
export function verifyAuditExport(jsonl: string, report: AuditVerificationReport): string | null {
  if (report.fileFormat !== "jsonl") return "Only the JSONL export can be verified.";
  if (sha256(jsonl) !== report.fileSha256) return "The file's sha256 doesn't match the report.";
  const lines = jsonl.split("\n").filter(Boolean);
  if (lines.length !== report.count) return "The number of entries doesn't match the report.";
  let prev = report.anchorHash;
  for (const [i, text] of lines.entries()) {
    let line: ExportLine;
    try {
      line = JSON.parse(text) as ExportLine;
    } catch {
      return `Line ${i + 1} isn't JSON.`;
    }
    if (line.prevHash !== prev) return `Entry ${line.id} doesn't link to the entry before it.`;
    if (rowHash(line) !== line.hash) return `Entry ${line.id} was changed after it was written.`;
    prev = line.hash;
  }
  if (prev !== report.lastHash) return "The last entry doesn't match the report.";
  return null;
}

export const auditExport: AuditExportExtension = { build: buildAuditExport };
