/**
 * What `deadlines.detail` holds: the date engine's working beyond `basis`,
 * so the UI can show why a date moved and what to check, and a person can
 * recompute it. Never document text.
 */
import type { Origin, Verification } from "@dueproof/contracts";

export interface DeadlineDetail {
  /** What moved the date (holidays, month ends, extensions). */
  adjustments: string[];
  /** What a person should look at that did not move the date. */
  warnings: string[];
  /** Plain words for the condonation window, when there is one. */
  windowBasis?: string;
  /** The date before roll-forward or extension, when either changed it. */
  originalDueOn?: string;
  /** The date engine's inputs. */
  inputs?: Record<string, string | number | boolean>;
  /** For deadlines from findings: how the finding was reconciled. */
  origin?: Origin;
  verification?: Verification;
  /** For statutory deadlines: where the rule comes from and whether a CA has checked it. */
  statutory?: {
    ruleKey: string;
    period: string;
    periodLabel: string;
    form: string;
    registrationId: string;
    source: { citation: string; url: string };
    verified: boolean;
    packVersion: string;
    packAsOf: string;
  };
}
