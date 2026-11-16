/**
 * The Notices register's rows, filters and CSV, as pure functions: the page
 * filters on the client, and the CSV export filters the same way on the
 * server, so the file always matches the view.
 */
export type CaseStageId =
  | "received"
  | "gathering"
  | "drafting"
  | "approval"
  | "filed"
  | "order"
  | "appeal"
  | "closed";

export type DueStateId = "overdue" | "today" | "week" | "later" | "done";

export interface NoticeRow {
  id: string;
  client: string | null;
  clientId: string | null;
  gstin: string | null;
  type: string;
  reference: string | null;
  issuedBy: string | null;
  received: string;
  receivedIso: string | null;
  nextDue: { state: DueStateId; date: string; iso: string } | null;
  stage: CaseStageId;
  demandMinor: number | null;
  owner: string | null;
  ownerId: string | null;
  language: string;
  channel: string;
}

export type Filters = Record<string, string[]>;

export const NO_OWNER = "none";

export function applyFilters(rows: NoticeRow[], filters: Filters, me: string): NoticeRow[] {
  const q = (filters.q?.[0] ?? "").trim().toLowerCase();
  const pick = (key: string) => filters[key] ?? [];
  return rows.filter((r) => {
    const stage = pick("stage");
    if (stage.length && !stage.includes(r.stage)) return false;
    const owner = pick("owner").map((o) => (o === "me" ? me : o));
    if (owner.length && !owner.includes(r.ownerId ?? NO_OWNER)) return false;
    const client = pick("client");
    if (client.length && !client.includes(r.clientId ?? NO_OWNER)) return false;
    const due = pick("due");
    if (due.length && !due.includes(r.nextDue?.state ?? "none")) return false;
    const type = pick("type");
    if (type.length && !type.includes(r.type)) return false;
    if (q) {
      const hay = [r.client, r.gstin, r.reference, r.type, r.issuedBy].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const STAGE_WORDS: Record<CaseStageId, string> = {
  received: "Received",
  gathering: "Documents gathered",
  drafting: "Draft reply",
  approval: "Partner approval",
  filed: "Filed on portal",
  order: "Order received",
  appeal: "Appeal",
  closed: "Closed",
};

function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote everything that needs it; neutralise spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The view as CSV, in the order shown: amounts in rupees with paise, dates as ISO. */
export function toCsv(rows: NoticeRow[]): string {
  const head = [
    "Client",
    "GSTIN",
    "Type",
    "Reference",
    "Issued by",
    "Received",
    "Next due",
    "Stage",
    "Demand (INR)",
    "Owner",
    "Language",
    "Source",
  ];
  const lines = rows.map((r) =>
    [
      r.client,
      r.gstin,
      r.type,
      r.reference,
      r.issuedBy,
      r.receivedIso,
      r.nextDue?.iso,
      STAGE_WORDS[r.stage],
      r.demandMinor === null ? null : (r.demandMinor / 100).toFixed(2),
      r.owner,
      r.language,
      r.channel,
    ]
      .map(cell)
      .join(","),
  );
  return `${[head.join(","), ...lines].join("\r\n")}\r\n`;
}
