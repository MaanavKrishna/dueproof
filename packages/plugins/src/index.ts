/**
 * The extension points for Business features (08 §1, §5).
 *
 * The free product (everything outside `ee/`) never imports `ee/` (house
 * rule 12). It talks to Business features only through these interfaces, and
 * it loads `ee/` dynamically when the directory is present (apps/app/lib/ee.ts).
 * With `ee/` deleted, every extension point is simply absent and the product
 * behaves as Self-hosted Free.
 *
 * Rules every extension follows:
 * - No licence state can block reading, proving, deadlines, export or backup.
 *   An extension adds something; switching it off loses no data.
 * - Verification is offline. No extension makes a network call on its own
 *   account (no activation server, no phone-home).
 * - Extensions never see document text.
 *
 * This package is types and small pure helpers only: no I/O, no ee code.
 */

// ------------------------------------------------------------------ features

/**
 * Every Business feature the licence format knows. v0.1 builds the first
 * three; the rest are named now so a licence issued today can carry them
 * (08 §1 "Later"). A licence may list features this build doesn't know; they
 * are kept and shown but switch nothing on.
 */
export const BUSINESS_FEATURES = [
  "sso",
  "audit-export",
  "white-label",
  "custom-retention",
  "scim",
  "siem",
  "high-availability",
  "multi-org",
] as const;
export type BusinessFeature = (typeof BUSINESS_FEATURES)[number];

/** The features v0.1 actually builds. */
export const V01_FEATURES: readonly BusinessFeature[] = ["sso", "audit-export", "white-label"];

export const FEATURE_LABELS: Readonly<Record<BusinessFeature, string>> = {
  sso: "Single sign-on (SAML)",
  "audit-export": "Audit export",
  "white-label": "White-label reports",
  "custom-retention": "Custom retention",
  scim: "SCIM provisioning",
  siem: "SIEM streaming",
  "high-availability": "High availability",
  "multi-org": "Multiple organisations",
};

export function isBusinessFeature(value: string): value is BusinessFeature {
  return (BUSINESS_FEATURES as readonly string[]).includes(value);
}

// ------------------------------------------------------------------ licence

/** What a licence says, once its signature checks out. */
export interface LicenceInfo {
  licenceId: string;
  /** The person or firm the licence is sold to. */
  licensee: string;
  /** The organisation name the licence was issued for (shown, not enforced). */
  orgName: string;
  /** As issued, including features this build doesn't know. */
  features: string[];
  /** Seat band; null when unlimited. Shown, never enforced by blocking sign-in. */
  seats: number | null;
  /** ISO 8601. */
  issuedAt: string;
  /** ISO 8601. */
  expiresAt: string;
}

/**
 * - none: no licence installed (Self-hosted Free).
 * - valid: in date.
 * - expiring: within 30 days of expiry; features on, banner shown.
 * - grace: expired less than 30 days ago; features on, warning banner.
 * - expired: past grace, or the clock looks set back; features off.
 * - invalid: the file doesn't verify (tampered, wrong key, malformed).
 */
export type LicenceState = "none" | "valid" | "expiring" | "grace" | "expired" | "invalid";

export interface LicenceStatus {
  state: LicenceState;
  /** Present when the signature verified (valid, expiring, grace, expired). */
  licence: LicenceInfo | null;
  /** Features switched on right now. Empty unless valid, expiring or grace. */
  active: BusinessFeature[];
  /** Whole days until expiry (expiring/valid) or until grace ends (grace). */
  daysLeft: number | null;
  /** ISO 8601; when Business features switch off. */
  graceEndsAt: string | null;
  /** A plain sentence for people when something is wrong. */
  problem: string | null;
}

export const NO_LICENCE: LicenceStatus = Object.freeze({
  state: "none",
  licence: null,
  active: [],
  daysLeft: null,
  graceEndsAt: null,
  problem: null,
}) as LicenceStatus;

export function featureActive(status: LicenceStatus, feature: BusinessFeature): boolean {
  return status.active.includes(feature);
}

/** The licence as stored in the `licence` table: the exact signed payload and its signature. */
export interface StoredLicence {
  payload: string;
  signature: string;
}

/** Where the app keeps the licence; ee never touches the database for it. */
export interface LicenceStore {
  read(): Promise<StoredLicence | null>;
  write(licence: StoredLicence): Promise<void>;
  remove(): Promise<void>;
  /**
   * The latest time this install has recorded anything (08 §5 clock
   * tampering): a clock set far behind it counts as expired.
   */
  latestSeenAt(): Promise<Date | null>;
}

export class LicenceFileError extends Error {
  override name = "LicenceFileError";
}

export interface LicenceExtension {
  /** Reads a pasted or uploaded licence file. Throws LicenceFileError with a plain message. */
  parseFile(text: string): StoredLicence;
  /** Verifies the signature offline and works out the state at `now`. Never throws. */
  evaluate(
    stored: StoredLicence | null,
    options: { now: Date; latestSeenAt?: Date | null },
  ): LicenceStatus;
}

// ------------------------------------------------------------------ SSO

/** Roles an identity provider may give someone who joins through SSO. */
export const SSO_ROLES = ["manager", "member", "viewer"] as const;
export type SsoRole = (typeof SSO_ROLES)[number];

/** A validated SAML set-up, ready to register. */
export interface SsoConfig {
  /** The IdP's entity ID. */
  issuer: string;
  /** The IdP's single sign-on URL. */
  entryPoint: string;
  /** Email domains that sign in through this IdP, lower case. */
  domains: string[];
  defaultRole: SsoRole;
  /** The IdP metadata XML, as fetched or pasted. */
  metadataXml: string;
  /** PEM signing certificates found in the metadata. */
  certificates: string[];
}

export interface SsoProviderView {
  providerId: string;
  issuer: string;
  domains: string[];
  defaultRole: SsoRole;
  /** What the admin pastes into their IdP. */
  acsUrl: string;
  spEntityId: string;
}

export class SsoConfigError extends Error {
  override name = "SsoConfigError";
}

export interface SsoRuntime {
  appUrl: string;
  /** True while the licence includes SSO and is in effect. */
  isLicensed(): Promise<boolean>;
  /** Someone joined an organisation through SSO (the app writes the audit entry). */
  onJoin?(event: { orgId: string; userId: string; role: SsoRole }): Promise<void>;
}

/**
 * SAML single sign-on through Better Auth's SSO plugin. The opaque types
 * (`database`, `auth`, the plugin list) are the app's own Database and Better
 * Auth instance; they stay `unknown` here so this package carries no runtime
 * dependency.
 */
export interface SsoExtension {
  /** Better Auth plugins to add at start-up. They refuse every request while unlicensed. */
  authPlugins(runtime: SsoRuntime): readonly unknown[];
  /**
   * Whether this email may sign up without an invitation because an IdP
   * vouches for it: only on an SSO endpoint (`path`), and only for a domain
   * of the provider making the assertion (`params.providerId`).
   */
  allowsSignUp(
    database: unknown,
    email: string,
    path: string | undefined,
    params?: Record<string, string | undefined>,
  ): Promise<boolean>;
  /**
   * Validates the form (metadata URL or XML, domains, default role). Fetches
   * the metadata URL only when one is given, https only, size-capped.
   */
  parseConfig(input: unknown, options?: { fetch?: typeof fetch }): Promise<SsoConfig>;
  /** The values the admin gives their IdP, known before anything is saved. */
  serviceProvider(
    appUrl: string,
    orgId: string,
  ): Pick<SsoProviderView, "providerId" | "acsUrl" | "spEntityId">;
  /** The DNS TXT record that proves an organisation owns a domain. */
  domainProof(orgId: string, domain: string): { name: string; value: string };
  list(database: unknown, orgId: string, appUrl: string): Promise<SsoProviderView[]>;
  /**
   * Registers the organisation's provider (replacing any earlier one) through
   * Better Auth, with the admin's own session headers.
   */
  save(
    auth: unknown,
    database: unknown,
    headers: Headers,
    orgId: string,
    config: SsoConfig,
    appUrl: string,
    /** requireDomainProof defaults to true (S1). */
    options?: { requireDomainProof?: boolean },
  ): Promise<SsoProviderView>;
  remove(database: unknown, orgId: string, providerId: string): Promise<boolean>;
  /** Whether any organisation on this install has SSO set up (sign-in page). */
  configured(database: unknown): Promise<boolean>;
}

// ------------------------------------------------------------------ audit export

export type AuditExportFormat = "jsonl" | "csv";

/** One audit row as the app reads it (all of the hashed fields). */
export interface AuditExportRow {
  id: number;
  orgId: string;
  at: Date;
  actor: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  requestId: string | null;
  detail: unknown;
  prevHash: string | null;
  hash: string;
}

export interface AuditVerificationReport {
  format: "dueproof-audit-verification";
  version: 1;
  orgId: string;
  generatedAt: string;
  range: { from: string | null; to: string | null };
  /** Rows in the range. */
  count: number;
  firstId: number | null;
  lastId: number | null;
  /** prevHash of the first exported row: the link to the entry before the range. */
  anchorHash: string | null;
  lastHash: string | null;
  /** Every hash recomputed and every link checked, from the first entry to the end of the range. */
  chain: { ok: boolean; checked: number; brokenAt: number | null };
  /** sha256 of the export file, so the pair can be checked together. */
  fileSha256: string;
  fileFormat: AuditExportFormat;
  howToVerify: string;
}

export interface AuditExportResult {
  filename: string;
  contentType: string;
  body: string;
  report: AuditVerificationReport;
}

export interface AuditExportExtension {
  /**
   * `chain` is every row from the organisation's first entry to the end of the
   * range (so the chain can be checked from its start); rows before `from`
   * are verified but not exported.
   */
  build(input: {
    orgId: string;
    chain: AuditExportRow[];
    from: Date | null;
    to: Date | null;
    format: AuditExportFormat;
    now: Date;
  }): AuditExportResult;
}

// ------------------------------------------------------------------ white label

export interface WhiteLabelExtension {
  /** Whether reports hide the Dueproof mark, given the licence status. */
  enabled(status: LicenceStatus): boolean;
}

// ------------------------------------------------------------------ the plugin

/** What `ee/` hands the app. Every member is optional except the licence. */
export interface EePlugin {
  licence: LicenceExtension;
  sso?: SsoExtension;
  auditExport?: AuditExportExtension;
  whiteLabel?: WhiteLabelExtension;
}

/** The days of warning before expiry, and of grace after it (08 §5). */
export const LICENCE_WARNING_DAYS = 30;
export const LICENCE_GRACE_DAYS = 30;
