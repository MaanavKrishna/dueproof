/**
 * Domain vocabulary shared by every lane. Changing anything here is a
 * contract change: its own PR, approved by the owner, then every lane rebases.
 */
import { z } from "zod";

/** UUIDv7 as text. */
export const Id = z.string().min(1).max(64);
export type Id = z.infer<typeof Id>;

/** Calendar date, no time: "2026-11-20". */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type IsoDate = z.infer<typeof IsoDate>;

/** Money is always integer minor units (paise for INR) plus a currency. */
export const Money = z.object({
  minor: z.number().int(),
  currency: z.string().length(3).default("INR"),
});
export type Money = z.infer<typeof Money>;

export const Role = z.enum(["owner", "admin", "manager", "member", "viewer"]);
export type Role = z.infer<typeof Role>;

/** Where a document came in. */
export const Channel = z.enum(["upload", "email", "whatsapp", "portal", "desktop", "import"]);
export type Channel = z.infer<typeof Channel>;

/** A document's part in its case thread. */
export const DocumentRole = z.enum([
  "notice",
  "reply",
  "acknowledgement",
  "order",
  "appeal",
  "attachment",
  "other",
]);
export type DocumentRole = z.infer<typeof DocumentRole>;

/** Pipeline state of a document (03 §6). */
export const DocumentStatus = z.enum([
  "received",
  "stored",
  "reading",
  "translating",
  "extracting",
  "ai_assist",
  "linking",
  "reconciling",
  "ready",
  "needs_review",
  "needs_password",
  "failed",
  "quarantined",
]);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

/** Case thread lifecycle (01 §4). */
export const CaseStage = z.enum([
  "received",
  "gathering",
  "drafting",
  "approval",
  "filed",
  "order",
  "appeal",
  "closed",
]);
export type CaseStage = z.infer<typeof CaseStage>;

export const FindingKind = z.enum([
  "obligation",
  "deadline",
  "hearing",
  "amount",
  "reference",
  "office",
  "section",
  "summary",
]);
export type FindingKind = z.infer<typeof FindingKind>;

/** Who proposed a finding. */
export const Origin = z.enum(["rule", "ai", "rule+ai", "human"]);
export type Origin = z.infer<typeof Origin>;

/** How well the quote was located on its page. `unlocated` can never become a deadline unconfirmed. */
export const Verification = z.enum(["exact", "strong", "approximate", "unlocated"]);
export type Verification = z.infer<typeof Verification>;

export const WorkStatus = z.enum(["open", "done", "dismissed"]);
export type WorkStatus = z.infer<typeof WorkStatus>;

/** Where a deadline came from. */
export const DeadlineSource = z.enum(["notice", "order", "statutory", "manual"]);
export type DeadlineSource = z.infer<typeof DeadlineSource>;

/** Registration kinds that drive the statutory calendar. */
export const RegistrationKind = z.enum(["gst", "tds", "income_tax", "roc", "other"]);
export type RegistrationKind = z.infer<typeof RegistrationKind>;

export const FilingFrequency = z.enum(["monthly", "quarterly", "annual"]);
export type FilingFrequency = z.infer<typeof FilingFrequency>;

/** What part of a demand an amount is (03 §8). */
export const DemandHead = z.enum(["tax", "interest", "penalty", "fee"]);
export type DemandHead = z.infer<typeof DemandHead>;

export const DemandStatus = z.enum(["open", "paid", "stayed", "dropped"]);
export type DemandStatus = z.infer<typeof DemandStatus>;

/** AI tiers, routed by code (04 §6). */
export const AiTier = z.enum(["none", "haiku", "sonnet", "opus", "local", "byok"]);
export type AiTier = z.infer<typeof AiTier>;

export const AiMode = z.enum(["off", "local", "byok", "plan"]);
export type AiMode = z.infer<typeof AiMode>;

/** Exact Claude model IDs used on the Dueproof plan. */
export const PLAN_MODELS = {
  haiku: "claude-haiku-5-5",
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
} as const;

/** A rectangle on a page, in PDF points from the top-left: [x0, y0, x1, y1]. */
export const Rect = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type Rect = z.infer<typeof Rect>;
