/**
 * CSV export (RFC 4180, CRLF, UTF-8 with a BOM so Excel reads ₹ and Indic
 * text). Cells that a spreadsheet would run as a formula (=, +, -, @, tab,
 * CR) are prefixed with an apostrophe (CSV injection).
 */
export type CsvCell = string | number | boolean | null | undefined;

export function csvCell(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** Paise to a plain rupee figure with two decimals ("452300.00"), for spreadsheets. */
export function rupees(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const neg = minor < 0;
  const abs = Math.abs(minor);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "cache-control": "private, no-store",
    },
  });
}
