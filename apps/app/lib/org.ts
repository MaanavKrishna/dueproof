/**
 * What every screen needs about the organisation: its people (owners,
 * assignees, mentions), its calendar (timezone, locale, holidays) and
 * "today" in its timezone. Dates are formatted with @dueproof/i18n; due
 * rungs come from @dueproof/core's ladder.
 */
import "server-only";
import type { Role } from "@dueproof/contracts";
import { dueBucket } from "@dueproof/core";
import { formatDate } from "@dueproof/i18n";
import type { AuthContext } from "./authorize";
import { loadOrgCalendar, type OrgCalendar } from "./calendar";
import { todayIn } from "./pipeline/status";
import { listMembers } from "./server/directory";

export interface Person {
  id: string;
  name: string;
  email: string;
  role: Role;
  mayApproveReplies: boolean;
}

export async function loadPeople(ctx: AuthContext): Promise<Person[]> {
  const members = await listMembers(ctx.container.database, ctx.orgId);
  return members.map((m) => ({
    id: m.userId,
    name: m.name,
    email: m.email,
    role: m.role,
    mayApproveReplies: m.mayApproveReplies,
  }));
}

export interface OrgClock extends OrgCalendar {
  today: string;
}

export async function loadClock(ctx: AuthContext, now: Date = new Date()): Promise<OrgClock> {
  const cal = await loadOrgCalendar(ctx.container, ctx.orgId);
  return { ...cal, today: todayIn(cal.timezone, now) };
}

/** The UI's due rung ("week", not core's "this_week"). */
export type DueState = "overdue" | "today" | "week" | "later" | "done";

export function dueState(dueOn: string, today: string, done = false): DueState {
  const b = dueBucket(dueOn, today, { done });
  return b === "this_week" ? "week" : b;
}

export function fmtDate(iso: string | null | undefined, locale = "en-IN"): string {
  return iso ? formatDate(iso, { locale }) : "";
}

/** "24 Oct, 11:20" in the organisation's timezone. */
export function fmtInstant(at: Date | string, timezone: string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(d);
}

/** Who to ask when access is refused (01 §4 "No permission": "Ask an admin (named)"). */
export function adminsOf(people: Person[]): string[] {
  return people.filter((p) => p.role === "owner" || p.role === "admin").map((p) => p.name);
}

/** Client-level access lives in one module; re-exported for the screens that import it from here. */
export { clientAllowed, clientScope } from "./client-access";
