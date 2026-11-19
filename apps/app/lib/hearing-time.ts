/**
 * A hearing's time of day (M8). The date engine gives the date; the time is
 * read, by this plain pattern, from the words the finding rests on ("fixed
 * on 18 November 2026 at 11:00 AM"), so anyone can say which words gave it.
 * Nothing here invents a time: no match, no time. A hearing at 11:00 is
 * overdue after 11:00, not "due today" all day.
 */
import type { DueState } from "./org";

export interface HearingTime {
  hour: number;
  minute: number;
  /** "11:00", the house 24-hour format. */
  label: string;
}

const TWELVE = /\b(\d{1,2})[:.](\d{2})\s*([ap])\.?\s?m\b\.?/i;
const TWENTY_FOUR = /\bat\s+(\d{1,2}):(\d{2})\b/i;

/** The time in a hearing's words, or null. */
export function readHearingTime(text: string | null | undefined): HearingTime | null {
  if (!text) return null;
  let hour: number;
  let minute: number;
  const t = TWELVE.exec(text);
  if (t) {
    hour = Number(t[1]);
    minute = Number(t[2]);
    if (hour < 1 || hour > 12) return null;
    const pm = (t[3] ?? "").toLowerCase() === "p";
    hour = (hour % 12) + (pm ? 12 : 0);
  } else {
    const u = TWENTY_FOUR.exec(text);
    if (!u) return null;
    hour = Number(u[1]);
    minute = Number(u[2]);
    if (hour > 23) return null;
  }
  if (minute > 59) return null;
  const label = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { hour, minute, label };
}

/** Minutes since midnight now, in the organisation's time zone. */
export function minutesNow(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

/**
 * The due rung, with the hearing's time: on the day, once the time has
 * passed, it is overdue.
 */
export function hearingState(
  state: DueState,
  dueOn: string,
  today: string,
  time: HearingTime | null,
  now: Date,
  timezone: string,
): DueState {
  if (!time || state !== "today" || dueOn !== today) return state;
  return minutesNow(now, timezone) >= time.hour * 60 + time.minute ? "overdue" : state;
}
