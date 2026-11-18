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
  /** The date counts from a received date nobody gave (the upload day stood in). */
  receivedOnAssumed?: boolean;
  /** Who corrected the date by hand, and when: the rule is then that fixed date. */
  correctedBy?: string;
  correctedAt?: string;
  /**
   * How the owner was chosen when the app set it (lib/deadline-owner.ts):
   * the case owner, the client's partner, or the uploader. `autoOwner` is
   * that person, so a later change by hand is never overwritten.
   */
  ownerFrom?: "case" | "client" | "uploader";
  autoOwner?: string;
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
