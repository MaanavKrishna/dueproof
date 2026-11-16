import type { Anchor, IsoDate, ResolvedDate } from "@dueproof/contracts";
import type { Extension, MatchValue, StatutoryPack } from "../statutory/types";

export type { Extension } from "../statutory/types";

/** Everything the date engine needs besides the rule. "Today" is never read from a clock. */
export interface DateContext {
  /** Known anchor dates (receipt, issue, order, service, hearing). */
  anchors: Partial<Record<Anchor, IsoDate>>;
  /** Organisation holidays (plus any national list the caller merges in). */
  holidays: IsoDate[];
  /** Working weekdays, 1 = Mon … 7 = Sun. Default in the db is Mon–Sat. */
  workingDays: number[];
  /** Dated overrides for statutory rules. */
  extensions?: Extension[];
  /** For basis text. Default "en-IN". */
  locale?: string;
  /**
   * Per-rule option for relative (notice/order) periods: move a due date that
   * lands on a non-working day to the next working day. Default OFF: the
   * earlier date is the safe one to show. VERIFY per authority whether the
   * next working day is accepted (General Clauses Act 1897 s.10 and the
   * Limitation Act s.4 point that way for courts and offices that are
   * closed; portals may not). Statutory rules carry their own flag in the pack.
   */
  rollForward?: boolean;
  /** Statutory rules: the pack (default: the India pack), event dates and registration facts. */
  statutory?: {
    pack?: StatutoryPack;
    /** e.g. { agm: "2026-09-25" } for the period being resolved. */
    events?: Record<string, IsoDate>;
    /** Registration facts, used to apply extensions scoped to some registrations. */
    facts?: Record<string, MatchValue>;
  };
}

/** A resolved date with the extra detail the UI and the deadline row keep. */
export interface ResolvedDateDetail extends ResolvedDate {
  adjustments: string[];
  /** Things a person should look at that did not move the date. */
  warnings: string[];
  /** Plain words for the condonation window, when there is one. */
  windowBasis?: string;
  /** The date before roll-forward or extension, when either changed it. */
  originalDueOn?: IsoDate;
  /** The inputs used, stored on the deadline row so the working can be shown and recomputed. */
  inputs: Record<string, string | number | boolean>;
}

export type DateErrorCode =
  /** The anchor (e.g. receipt date) is not known yet: the UI asks for it. */
  | "missing_anchor"
  | "invalid_date"
  | "invalid_rule"
  | "unknown_rule"
  | "bad_period"
  | "rule_not_in_effect"
  | "no_working_days";

export interface DateError {
  error: DateErrorCode;
  message: string;
  anchor?: Anchor;
}

export function isDateError(x: ResolvedDateDetail | DateError): x is DateError {
  return "error" in x;
}
