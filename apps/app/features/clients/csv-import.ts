/**
 * Client import from CSV (Tally and Zoho exports saved as CSV, or a sheet
 * pasted from Excel as tab-separated text): parse, guess a column mapping,
 * and validate each row (GSTIN check character, PAN shape) before anything
 * is written. Pure, so it runs in the browser for the preview and on the
 * server for the import itself.
 */
import { checkCin, checkGstin, checkPan, checkTan, panOfGstin } from "@dueproof/core/identifiers";

export const IMPORT_FIELDS = [
  "name",
  "legalName",
  "pan",
  "gstin",
  "gstFrequency",
  "tan",
  "cin",
  "tags",
  "contactName",
  "contactEmail",
  "contactPhone",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABEL: Record<ImportField, string> = {
  name: "Client name",
  legalName: "Legal name",
  pan: "PAN",
  gstin: "GSTIN(s)",
  gstFrequency: "GST filing (monthly / quarterly)",
  tan: "TAN",
  cin: "CIN",
  tags: "Tags",
  contactName: "Contact name",
  contactEmail: "Contact email",
  contactPhone: "Contact phone / WhatsApp",
};

/** Column index for each field, or -1 when not mapped. */
export type Mapping = Record<ImportField, number>;

export interface ImportRow {
  line: number;
  name: string;
  legalName: string | null;
  pan: string | null;
  gstins: string[];
  gstFrequency: "monthly" | "quarterly" | null;
  tan: string | null;
  cin: string | null;
  tags: string[];
  contact: { name: string; email: string | null; phone: string | null } | null;
}

export interface ImportIssue {
  /** 1-based line in the file (the header is line 1). */
  line: number;
  field: ImportField;
  message: string;
}

export interface Validated {
  rows: ImportRow[];
  issues: ImportIssue[];
  /** Lines with an issue are left out of `rows`. */
  skipped: number;
}

export const MAX_IMPORT_ROWS = 5000;

/** RFC 4180 CSV (quotes, doubled quotes, newlines in quotes), or TSV when the first line has tabs. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep =
    firstLine.includes("\t") && !firstLine.includes(",")
      ? "\t"
      : firstLine.split(";").length > firstLine.split(",").length
        ? ";"
        : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HINTS: Record<ImportField, RegExp> = {
  name: /^(client|party|customer|ledger|company)?\s*name$|^name of (the )?(client|party)$|^client$|^party$/i,
  legalName: /legal|registered name|trade name/i,
  pan: /\bpan\b|income tax no/i,
  gstin: /gst\s*(in|no|number|registration)|^gstin|^gst$/i,
  gstFrequency: /frequency|qrmp|filing (period|type)|return period/i,
  tan: /\btan\b/i,
  cin: /\bcin\b|corporate identity|llpin/i,
  tags: /tag|group|category/i,
  contactName: /contact( person)?( name)?$|^contact$/i,
  contactEmail: /e-?mail/i,
  contactPhone: /phone|mobile|whats ?app|contact no/i,
};

export function guessMapping(headers: string[]): Mapping {
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, -1])) as Mapping;
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && HINTS[field].test(h.trim()));
    if (i >= 0) {
      mapping[field] = i;
      used.add(i);
    }
  }
  return mapping;
}

const cellOf = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");

/** Validate data rows (without the header) against a mapping. */
export function validateImport(dataRows: string[][], mapping: Mapping): Validated {
  const rows: ImportRow[] = [];
  const issues: ImportIssue[] = [];
  let skipped = 0;
  dataRows.slice(0, MAX_IMPORT_ROWS).forEach((cells, idx) => {
    const line = idx + 2;
    const before = issues.length;
    const get = (f: ImportField) => cellOf(cells, mapping[f]);
    const name = get("name");
    if (!name) issues.push({ line, field: "name", message: "The client name is missing." });
    if (name.length > 200)
      issues.push({ line, field: "name", message: "The name is over 200 characters." });

    let pan: string | null = null;
    if (get("pan")) {
      const r = checkPan(get("pan"));
      if (r.ok) pan = r.value;
      else issues.push({ line, field: "pan", message: r.reason ?? "Check this PAN." });
    }
    const gstins: string[] = [];
    for (const raw of get("gstin")
      .split(/[;,/|\s]+/)
      .filter(Boolean)) {
      const r = checkGstin(raw);
      if (r.ok) gstins.push(r.value);
      else
        issues.push({
          line,
          field: "gstin",
          message: `${r.value}: ${r.reason ?? "check this GSTIN."}`,
        });
    }
    if (pan && gstins.some((g) => panOfGstin(g) !== pan)) {
      issues.push({
        line,
        field: "gstin",
        message: "A GSTIN on this row doesn't contain the row's PAN.",
      });
    }
    if (!pan && gstins[0]) pan = panOfGstin(gstins[0]);

    let gstFrequency: ImportRow["gstFrequency"] = null;
    const freq = get("gstFrequency").toLowerCase();
    if (freq) {
      if (/^(m|monthly)$/.test(freq)) gstFrequency = "monthly";
      else if (/^(q|quarterly|qrmp)$/.test(freq)) gstFrequency = "quarterly";
      else issues.push({ line, field: "gstFrequency", message: "Use monthly or quarterly." });
    }
    let tan: string | null = null;
    if (get("tan")) {
      const r = checkTan(get("tan"));
      if (r.ok) tan = r.value;
      else issues.push({ line, field: "tan", message: r.reason ?? "Check this TAN." });
    }
    let cin: string | null = null;
    if (get("cin")) {
      const r = checkCin(get("cin"));
      if (r.ok) cin = r.value;
      else issues.push({ line, field: "cin", message: r.reason ?? "Check this CIN." });
    }
    const email = get("contactEmail");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      issues.push({
        line,
        field: "contactEmail",
        message: "This email address doesn't look right.",
      });
    }
    const phone = get("contactPhone").replace(/[^\d+]/g, "");
    if (get("contactPhone") && !/^\+?\d{10,13}$/.test(phone)) {
      issues.push({ line, field: "contactPhone", message: "Phone numbers need 10 to 13 digits." });
    }

    if (issues.length > before) {
      skipped += 1;
      return;
    }
    const contactName = get("contactName");
    rows.push({
      line,
      name,
      legalName: get("legalName") || null,
      pan,
      gstins,
      gstFrequency,
      tan,
      cin,
      tags: get("tags")
        .split(/[;,|]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10),
      contact:
        contactName || email || phone
          ? {
              name: contactName || name,
              email: email || null,
              phone: phone ? normalisePhone(phone) : null,
            }
          : null,
    });
  });
  if (dataRows.length > MAX_IMPORT_ROWS) skipped += dataRows.length - MAX_IMPORT_ROWS;
  return { rows, issues, skipped };
}

/** "+91" plus ten digits for Indian mobiles; other numbers kept as typed (digits and a leading +). */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  if (/^91\d{10}$/.test(digits)) return `+${digits}`;
  if (/^0\d{10}$/.test(digits)) return `+91${digits.slice(1)}`;
  return digits;
}
