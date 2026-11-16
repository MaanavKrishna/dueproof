import type { IsoDate } from "@dueproof/contracts";
import { diffDays } from "./calendar";

/** The due ladder (02 §2): Overdue · Today · This week · Later · Done. */
export type DueBucket = "overdue" | "today" | "this_week" | "later" | "done";

export interface DueBucketOptions {
  done?: boolean;
  /** "This week" covers the next N days after today. Default 6 (a rolling seven-day week). */
  weekDays?: number;
}

/** Which ladder rung a due date is on, with today passed in. */
export function dueBucket(
  dueOn: IsoDate,
  today: IsoDate,
  options: DueBucketOptions = {},
): DueBucket {
  if (options.done) return "done";
  const days = diffDays(today, dueOn);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= (options.weekDays ?? 6)) return "this_week";
  return "later";
}
