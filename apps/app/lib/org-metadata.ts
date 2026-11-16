/**
 * Organisation facts that have no column of their own yet live as JSON in
 * Better Auth's `organization.metadata`: which notice profiles are on, the
 * languages its notices come in (OCR and translation hints), where
 * first-run setup got to, and client-level access per member. Pure parse and
 * update helpers; unknown or malformed values fall back to defaults so a bad
 * row never breaks a page.
 */

import { knownLanguages } from "./languages";

export const PROFILES = [
  {
    id: "gst",
    label: "GST",
    description: "ASMT-10, DRC-01, REG-17 and others; GSTR-1, 3B and 9 calendar",
  },
  {
    id: "income_tax",
    label: "Income tax",
    description: "143(1), 142(1), 148A, 156; advance tax and ITR calendar",
  },
  { id: "tds", label: "TDS", description: "200A intimations; TDS payments and returns" },
  { id: "roc", label: "ROC / MCA", description: "Adjudication notices; AOC-4 and MGT-7" },
  { id: "courts", label: "Courts and tribunals", description: "Hearing notices and orders" },
] as const;

export type ProfileId = (typeof PROFILES)[number]["id"];
export const PROFILE_IDS: readonly ProfileId[] = PROFILES.map((p) => p.id);
export const DEFAULT_PROFILES: readonly ProfileId[] = ["gst", "income_tax", "tds"];

export interface Onboarding {
  /** ISO time setup was finished. */
  completedAt?: string;
  /** ISO time the owner left setup without finishing. */
  dismissedAt?: string;
}

export interface OrgMetadata {
  profiles: ProfileId[];
  /**
   * Indian languages the organisation's notices come in (codes from
   * lib/languages.ts). Sent to the engine as OCR hints beside English.
   */
  languages: string[];
  onboarding: Onboarding;
  /**
   * Client-level access: member user id → the client ids they may work on.
   * A member with no entry sees every client (05 §2). Owners and admins
   * always see every client, whatever is stored here.
   */
  clientAccess: Record<string, string[]>;
}

export function parseOrgMetadata(raw: string | null | undefined): OrgMetadata {
  let value: unknown = null;
  if (raw) {
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
  }
  const obj = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const profiles = Array.isArray(obj.profiles)
    ? obj.profiles.filter((p): p is ProfileId => PROFILE_IDS.includes(p as ProfileId))
    : [...DEFAULT_PROFILES];

  const languages = Array.isArray(obj.languages) ? knownLanguages(obj.languages) : [];

  const ob = obj.onboarding && typeof obj.onboarding === "object" ? obj.onboarding : {};
  const onboarding: Onboarding = {};
  for (const k of ["completedAt", "dismissedAt"] as const) {
    const v = (ob as Record<string, unknown>)[k];
    if (typeof v === "string") onboarding[k] = v;
  }

  const clientAccess: Record<string, string[]> = {};
  if (obj.clientAccess && typeof obj.clientAccess === "object") {
    for (const [userId, ids] of Object.entries(obj.clientAccess as Record<string, unknown>)) {
      if (Array.isArray(ids)) clientAccess[userId] = ids.filter((i) => typeof i === "string");
    }
  }

  return { ...obj, profiles, languages, onboarding, clientAccess } as OrgMetadata;
}

export function serialiseOrgMetadata(meta: OrgMetadata): string {
  return JSON.stringify(meta);
}

/** The client ids a member is limited to, or undefined for every client. */
export function clientIdsFor(meta: OrgMetadata, userId: string): string[] | undefined {
  return meta.clientAccess[userId];
}
