/**
 * Pure helpers for the Deadlines list: filter rows by the filter bar's
 * values, and group them by week (Monday to Sunday), with everything
 * overdue first. Shared with the server for CSV export.
 */
import type { DeadlineRow } from "@/lib/deadline-rows";

export type Filters = Record<string, string[]>;

export function applyFilters(rows: DeadlineRow[], f: Filters, today: string): DeadlineRow[] {
  const has = (k: string) => (f[k]?.length ?? 0) > 0;
  const statuses = has("status") ? (f.status as string[]) : ["open"];
  return rows.filter((r) => {
    if (has("client") && !f.client?.includes(r.clientId ?? "none")) return false;
    if (has("person") && !f.person?.includes(r.ownerUserId ?? "none")) return false;
    if (has("type") && !f.type?.includes(r.type)) return false;
    if (has("source") && !f.source?.includes(r.source)) return false;
    const status =
      r.status === "open" && r.snoozedUntil && r.snoozedUntil > today ? "snoozed" : r.status;
    return statuses.includes(status);
  });
}

function epoch(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}
function fromEpoch(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

/** The Monday of an ISO date's week. */
export function mondayOf(iso: string): string {
  const n = epoch(iso);
  const weekday = (new Date(n * 86_400_000).getUTCDay() + 6) % 7; // 0 = Monday
  return fromEpoch(n - weekday);
}

export interface WeekGroup {
  id: string;
  /** "Overdue", "This week", "Next week", "Week of 30 Nov". */
  label: string;
  /** "16–22 Nov 2026" for week groups. */
  range: string | null;
  rows: DeadlineRow[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dm(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

export function weekRange(monday: string): string {
  const sunday = fromEpoch(epoch(monday) + 6);
  const year = sunday.slice(0, 4);
  return monday.slice(5, 7) === sunday.slice(5, 7)
    ? `${Number(monday.slice(8, 10))}–${dm(sunday)} ${year}`
    : `${dm(monday)} – ${dm(sunday)} ${year}`;
}

/** The group for deadlines read from documents not yet filed in a case. */
export const UNFILED = "unfiled";

export function groupByWeek(rows: DeadlineRow[], today: string): WeekGroup[] {
  const thisWeek = mondayOf(today);
  const nextWeek = fromEpoch(epoch(thisWeek) + 7);
  const groups = new Map<string, WeekGroup>();
  const sorted = [...rows].sort(
    (a, b) => a.dueOn.localeCompare(b.dueOn) || a.title.localeCompare(b.title),
  );
  for (const r of sorted) {
    // Read from a document nobody has filed: not counted as due until it is (H2).
    const unfiled = r.status === "open" && r.unfiled;
    const overdue = !unfiled && r.status === "open" && r.dueOn < today;
    const id = unfiled ? UNFILED : overdue ? "overdue" : mondayOf(r.dueOn);
    let g = groups.get(id);
    if (unfiled && !g) {
      g = { id, label: "Not filed yet", range: null, rows: [] };
      groups.set(id, g);
    }
    if (!g) {
      const label = overdue
        ? "Overdue"
        : id === thisWeek
          ? "This week"
          : id === nextWeek
            ? "Next week"
            : id < thisWeek
              ? `Week of ${dm(id)} ${id.slice(0, 4)}`
              : `Week of ${dm(id)}`;
      g = { id, label, range: overdue ? null : weekRange(id), rows: [] };
      groups.set(id, g);
    }
    g.rows.push(r);
  }
  const rank = (id: string) => (id === "overdue" ? 0 : id === UNFILED ? 2 : 1);
  return [...groups.values()].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}
