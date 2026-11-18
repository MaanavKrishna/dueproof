/**
 * Statutory calendar types. Rules are DATA in a country pack; the functions
 * in this folder only interpret them. Every rule carries its source and a
 * `verified` flag, which stays false until a practising CA signs it off
 * (03 §8a, D-prod-4).
 */
import type { IsoDate, RegistrationKind } from "@dueproof/contracts";

/** What one obligation covers. */
export type PeriodType =
  /** "2026-10" */
  | "month"
  /** "FY2026-27-Q1" (financial-year quarter; "2026-Q3" calendar form is accepted on input) */
  | "quarter"
  /** "FY2025-26" */
  | "fy"
  /** "FY2026-27-I1" … "-I4": advance-tax instalments */
  | "fy_instalment";

/** A date fixed relative to a financial year's start year. */
export interface FyDate {
  month: number;
  day: number;
  /** Years after the FY's start year: FY2025-26 + 1 → 2026. */
  yearsAfterStart: number;
}

export type DueRule =
  /**
   * Day `day` of the month that is `monthsAfter` months after the period's
   * last month ("20th of the following month" = day 20, monthsAfter 1).
   * `overrides` replace the rule for periods ending in a given month (the
   * TDS March case).
   */
  | {
      type: "day_after_period";
      day: number;
      monthsAfter: number;
      overrides?: { periodEndMonth: number; day: number; monthsAfter: number; text: string }[];
    }
  /** A fixed date after an FY-type period: GSTR-9 31 Dec, ITR 31 Jul. */
  | ({ type: "fy_date" } & FyDate)
  /** One date per instalment period (I1 … In). */
  | { type: "instalments"; dates: (FyDate & { text: string })[] }
  /**
   * N days after an event in the period's following year (AOC-4: 30 days
   * from the AGM). Without the event date the fallback (the last day the
   * event may lawfully be held) is used and a warning is recorded.
   */
  | {
      type: "days_after_event";
      event: string;
      days: number;
      fallback: FyDate & { text: string };
    };

/** Values a registration exposes to rule matching. `null` matches "not set". */
export type MatchValue = string | boolean | null;

export interface StatutorySource {
  /** e.g. "CGST Rules 2017, r.61(5); Notification 76/2020-CT" */
  citation: string;
  url: string;
}

export interface StatutoryRule {
  /** e.g. "in.gst.gstr3b.monthly" */
  key: string;
  /** e.g. "GSTR-3B" */
  form: string;
  /** e.g. "GSTR-3B monthly return" */
  title: string;
  appliesTo: {
    kind: RegistrationKind;
    /** Each listed field must have one of the listed values (see `registrationFacts`). */
    match?: Record<string, readonly MatchValue[]>;
  };
  periodType: PeriodType;
  due: DueRule;
  /** Plain words for the due rule: "20th of the following month". */
  dueText: string;
  /**
   * Whether a due date on a non-working day moves to the next working day.
   * Default false everywhere in v0.1: the earlier date is the safe one to
   * show. VERIFY per form (General Clauses Act s.10; portals do not always
   * accept the next day without a notification).
   */
  rollForward: boolean;
  source: StatutorySource;
  /** False until a practising CA has checked the rule against the statute. */
  verified: boolean;
  notes: string;
  /** First period start this rule applies to (inclusive). */
  effectiveFrom?: IsoDate;
  /** Last period start this rule applies to (inclusive). */
  effectiveTo?: IsoDate;
  /**
   * Warnings added to an item when the registration's facts match `when`:
   * how a rule that also covers a missing fact says it assumed something
   * ("frequency not recorded: shown as monthly"). Never silent.
   */
  checks?: readonly { when: Record<string, readonly MatchValue[]>; warning: string }[];
}

/**
 * Forms a registration of this kind is expected to file. When a listed form
 * has no rule that fits the registration's facts, `statutoryCoverage` says so
 * rather than the form vanishing from the calendar.
 */
export interface ExpectedForms {
  kind: RegistrationKind;
  match?: Record<string, readonly MatchValue[]>;
  forms: readonly string[];
}

/**
 * An obligation the pack knows about but does not generate: shown to the
 * user as "not covered" so a calendar never reads as complete when it is not.
 */
export interface NotCoveredMarker {
  key: string;
  form: string;
  title: string;
  appliesTo: { kind: RegistrationKind; match?: Record<string, readonly MatchValue[]> };
  /** Plain words: what the obligation is and when it usually falls due. */
  reason: string;
  source: StatutorySource;
  verified: boolean;
}

/** One line of "what this calendar does not cover" for a registration. */
export interface CoverageNote {
  registrationId: string;
  /** `no_rule`: an expected form has no rule for these facts; `not_covered`: the pack does not generate it. */
  type: "no_rule" | "not_covered";
  form: string;
  title: string;
  reason: string;
  source?: StatutorySource;
}

export interface StatutoryPack {
  /** ISO 3166 alpha-2, lower case: "in" */
  country: string;
  /** Data version, e.g. "in-2026.11.0" */
  version: string;
  /** When the data was last checked: shown as "calendar data as of …". */
  asOf: IsoDate;
  /** 4 = April */
  fyStartMonth: number;
  rules: readonly StatutoryRule[];
  /** Optional derived facts, e.g. GST state code → QRMP state group. */
  stateGroups?: Readonly<Record<string, string>>;
  /** Forms each kind of registration should produce (see `statutoryCoverage`). */
  expectedForms?: readonly ExpectedForms[];
  /** Obligations the pack does not generate, listed so they are visible. */
  notCovered?: readonly NotCoveredMarker[];
}

/**
 * A dated override: a government extension (citing its notification) or a
 * firm's own override (labelled as such). Applies to one rule and period.
 */
export interface Extension {
  ruleKey: string;
  /** Canonical or accepted period string; normalised before comparison. */
  period: string;
  newDueOn: IsoDate;
  /** Notification or circular, e.g. "Notification 18/2026-CT dated 10 Nov 2026"; or "Firm override". */
  source: string;
  announcedOn: IsoDate;
  /** Default "government". */
  kind?: "government" | "firm";
  /** Restrict to registrations whose facts match, e.g. { stateCode: ["32"] } for one state. */
  where?: Record<string, readonly MatchValue[]>;
}

/** A client's registration, as the calendar needs it (mirrors the `registrations` table). */
export interface Registration {
  id: string;
  clientId?: string;
  kind: RegistrationKind;
  /** GSTIN / TAN / PAN / CIN */
  identifier?: string;
  /** GST state code ("32") or name; derived from a GSTIN when absent. */
  state?: string;
  frequency?: "monthly" | "quarterly" | "annual";
  /** "qrmp", "regular", "composition", … */
  scheme?: string;
  validFrom?: IsoDate;
  validTo?: IsoDate;
  /**
   * Further facts for matching: income tax { audit: true, transferPricing:
   * true, advanceTax: "regular" | "presumptive" | "none" }, etc.
   */
  attributes?: Record<string, string | boolean>;
  /** Event dates per period, e.g. { "FY2025-26": { agm: "2026-09-25" } }. */
  events?: Record<string, Record<string, IsoDate>>;
}

export interface ParsedPeriod {
  type: PeriodType;
  /** Canonical form: "2026-10", "FY2026-27-Q1", "FY2025-26", "FY2026-27-I2" */
  canonical: string;
  /** First and last day covered (for instalments: the whole FY). */
  start: IsoDate;
  end: IsoDate;
  /** Start year of the FY that contains the period. */
  fyStart: number;
  /** Quarter or instalment number, 1-based. */
  index?: number;
  /** "Oct 2026", "Q1 FY 2026–27 (Apr–Jun 2026)", "FY 2025–26", "Instalment 2, FY 2026–27" */
  label: string;
}

export interface StatutoryItem {
  /**
   * `${registrationId}:${formKey}:${period}` (see `statutoryKey`): stable
   * when a registration's facts change which rule applies (state group,
   * audit flag), and unique per client (db deadlines.statutory_key).
   */
  statutoryKey: string;
  ruleKey: string;
  period: string;
  periodLabel: string;
  form: string;
  title: string;
  registrationId: string;
  clientId?: string;
  dueOn: IsoDate;
  /** The date before any extension or roll-forward. */
  originalDueOn: IsoDate;
  basis: string;
  rule: { type: "statutory"; ruleKey: string; period: string };
  adjustments: string[];
  warnings: string[];
  source: StatutorySource;
  verified: boolean;
  /** Pack version and as-of date, for "calendar data as of …". */
  packVersion: string;
  packAsOf: IsoDate;
}
