/**
 * Settings → Me and Organisation (01 §3): profile name, organisation name,
 * country, time zone, financial year, working days, escalation, holidays,
 * report logo, notice profiles and first-run progress.
 *
 * Callers authorise first (AGENTS rule 4) and pass the context in; every
 * change writes an audit entry naming what changed (never the values of
 * anything secret).
 */
import "server-only";
import { asc, audit, eq, holidays, orgSettings, withOrg } from "@dueproof/db";
import { orgKey } from "@dueproof/storage";
import { z } from "zod";
import type { AuthContext } from "./authorize";
import { badRequest, notFound } from "./errors";
import { COUNTRY_OPTIONS, TIMEZONE_OPTIONS } from "./form-options";
import { knownLanguages, LANGUAGE_CODES } from "./languages";
import { type Onboarding, PROFILE_IDS, type ProfileId } from "./org-metadata";
import { getOrg, getUser, renameOrg, renameUser, updateOrgMetadata } from "./server/directory";

async function writeAudit(
  ctx: AuthContext,
  action: string,
  detail: Record<string, unknown>,
  target?: { type: string; id: string },
): Promise<void> {
  await withOrg(ctx.container.database, ctx.orgId, (tx, orgCtx) =>
    audit.write(tx, orgCtx, {
      actor: ctx.userId,
      action,
      targetType: target?.type ?? "organisation",
      targetId: target?.id ?? ctx.orgId,
      requestId: ctx.requestId,
      detail,
    }),
  );
}

export { writeAudit };

// ------------------------------------------------------------------ Me

export const ProfileInput = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
});

export async function updateProfileFor(ctx: AuthContext, raw: unknown): Promise<{ name: string }> {
  const parsed = ProfileInput.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Check your name.");
  await renameUser(ctx.container.database, ctx.userId, parsed.data.name);
  await writeAudit(ctx, "user.update", { fields: ["name"] }, { type: "user", id: ctx.userId });
  return { name: parsed.data.name };
}

export async function getMe(ctx: AuthContext) {
  const me = await getUser(ctx.container.database, ctx.userId);
  if (!me) throw notFound("Your account");
  return me;
}

// ------------------------------------------------------------------ Organisation

export interface HolidayRow {
  day: string;
  name: string;
}

export interface OrganisationView {
  name: string;
  country: string;
  timezone: string;
  fiscalYearStartMonth: number;
  /** ISO weekdays: 1 = Monday … 7 = Sunday. */
  workingDays: number[];
  escalationDays: { manager: number; partner: number };
  hasReportLogo: boolean;
  reportLogoUrl: string | null;
  holidays: HolidayRow[];
  profiles: ProfileId[];
  /** Languages the notices come in, beside English (OCR hints). */
  languages: string[];
  onboarding: Onboarding;
}

const DEFAULT_ESCALATION = { manager: 1, partner: 3 };

export async function getOrganisationFor(ctx: AuthContext): Promise<OrganisationView> {
  const { database, storage } = ctx.container;
  const org = await getOrg(database, ctx.orgId);
  if (!org) throw notFound("Your organisation");
  const { settings, days } = await withOrg(database, ctx.orgId, async (tx) => {
    await tx.insert(orgSettings).values({ orgId: ctx.orgId }).onConflictDoNothing();
    const [settings] = await tx
      .select()
      .from(orgSettings)
      .where(eq(orgSettings.orgId, ctx.orgId))
      .limit(1);
    const days = await tx
      .select({ day: holidays.day, name: holidays.name })
      .from(holidays)
      .where(eq(holidays.orgId, ctx.orgId))
      .orderBy(asc(holidays.day));
    return { settings, days };
  });
  if (!settings) throw notFound("Organisation settings");
  let reportLogoUrl: string | null = null;
  if (settings.reportLogoKey) {
    try {
      reportLogoUrl = (await storage.getSignedUrl(settings.reportLogoKey, { expiresIn: 300 })).url;
    } catch {
      reportLogoUrl = null;
    }
  }
  return {
    name: org.name,
    country: settings.country,
    timezone: settings.timezone,
    fiscalYearStartMonth: settings.fiscalYearStartMonth,
    workingDays: [...settings.workingDays].sort(),
    escalationDays: settings.escalationDays ?? DEFAULT_ESCALATION,
    hasReportLogo: Boolean(settings.reportLogoKey),
    reportLogoUrl,
    holidays: days.map((d) => ({ day: String(d.day), name: d.name })),
    profiles: org.metadata.profiles,
    languages: org.metadata.languages,
    onboarding: org.metadata.onboarding,
  };
}

export const OrganisationInput = z
  .object({
    name: z.string().trim().min(2, "Enter your organisation's name.").max(120),
    country: z.enum(COUNTRY_OPTIONS.map((c) => c.value) as [string, ...string[]]),
    timezone: z.enum(TIMEZONE_OPTIONS.map((t) => t.value) as [string, ...string[]]),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
    workingDays: z
      .array(z.number().int().min(1).max(7))
      .min(1, "Choose at least one working day.")
      .max(7),
    escalationDays: z
      .object({
        manager: z.number().int().min(0).max(30),
        partner: z.number().int().min(0).max(60),
      })
      .refine((e) => e.partner >= e.manager, {
        message: "The partner hears after the manager, not before.",
      }),
  })
  .partial()
  .strict();
export type OrganisationInput = z.input<typeof OrganisationInput>;

export async function saveOrganisationFor(
  ctx: AuthContext,
  raw: unknown,
): Promise<OrganisationView> {
  const parsed = OrganisationInput.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Check the form.");
  const { name, ...rest } = parsed.data;
  const { database } = ctx.container;
  if (name !== undefined) await renameOrg(database, ctx.orgId, name);
  const changes: Partial<typeof orgSettings.$inferInsert> = {};
  if (rest.country !== undefined) changes.country = rest.country;
  if (rest.timezone !== undefined) changes.timezone = rest.timezone;
  if (rest.fiscalYearStartMonth !== undefined)
    changes.fiscalYearStartMonth = rest.fiscalYearStartMonth;
  if (rest.workingDays !== undefined)
    changes.workingDays = [...new Set(rest.workingDays)].sort((a, b) => a - b);
  if (rest.escalationDays !== undefined) changes.escalationDays = rest.escalationDays;
  await withOrg(database, ctx.orgId, async (tx, orgCtx) => {
    await tx.insert(orgSettings).values({ orgId: ctx.orgId }).onConflictDoNothing();
    if (Object.keys(changes).length > 0)
      await tx.update(orgSettings).set(changes).where(eq(orgSettings.orgId, ctx.orgId));
    await audit.write(tx, orgCtx, {
      actor: ctx.userId,
      action: "org.settings.update",
      targetType: "organisation",
      targetId: ctx.orgId,
      requestId: ctx.requestId,
      detail: { fields: Object.keys(parsed.data).sort() },
    });
  });
  return getOrganisationFor(ctx);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const HolidaysInput = z
  .array(
    z.object({
      day: z
        .string()
        .regex(ISO_DATE, "Use a date like 2026-01-26.")
        .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "That date doesn't exist."),
      name: z.string().trim().min(1, "Name each holiday.").max(120),
    }),
  )
  .max(400, "That's more holidays than days in a year.");

export async function saveHolidaysFor(ctx: AuthContext, raw: unknown): Promise<HolidayRow[]> {
  const parsed = HolidaysInput.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Check the holidays.");
  const byDay = new Map<string, string>();
  for (const h of parsed.data) byDay.set(h.day, h.name);
  const rows = [...byDay.entries()]
    .map(([day, name]) => ({ day, name }))
    .sort((a, b) => a.day.localeCompare(b.day));
  await withOrg(ctx.container.database, ctx.orgId, async (tx, orgCtx) => {
    await tx.delete(holidays).where(eq(holidays.orgId, ctx.orgId));
    if (rows.length > 0)
      await tx.insert(holidays).values(rows.map((r) => ({ orgId: ctx.orgId, ...r })));
    await audit.write(tx, orgCtx, {
      actor: ctx.userId,
      action: "org.holidays.replace",
      targetType: "organisation",
      targetId: ctx.orgId,
      requestId: ctx.requestId,
      detail: { count: rows.length },
    });
  });
  return rows;
}

// ------------------------------------------------------------------ Report logo

export const LOGO_MAX_BYTES = 512 * 1024;

/** PNG or JPEG by their magic bytes (never SVG: it can carry script). */
export function sniffLogo(bytes: Uint8Array): "png" | "jpg" | null {
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

export async function setReportLogoFor(
  ctx: AuthContext,
  bytes: Uint8Array | null,
): Promise<{ hasReportLogo: boolean }> {
  const { database, storage } = ctx.container;
  let key: string | null = null;
  if (bytes) {
    if (bytes.byteLength > LOGO_MAX_BYTES) throw badRequest("The logo must be 512 KB or smaller.");
    const kind = sniffLogo(bytes);
    if (!kind) throw badRequest("Use a PNG or JPEG image.");
    key = orgKey(ctx.orgId, "branding", `report-logo.${kind}`);
    await storage.put(key, bytes, { contentType: kind === "png" ? "image/png" : "image/jpeg" });
  }
  const previous = await withOrg(database, ctx.orgId, async (tx, orgCtx) => {
    await tx.insert(orgSettings).values({ orgId: ctx.orgId }).onConflictDoNothing();
    const [row] = await tx
      .select({ key: orgSettings.reportLogoKey })
      .from(orgSettings)
      .where(eq(orgSettings.orgId, ctx.orgId));
    await tx
      .update(orgSettings)
      .set({ reportLogoKey: key })
      .where(eq(orgSettings.orgId, ctx.orgId));
    await audit.write(tx, orgCtx, {
      actor: ctx.userId,
      action: key ? "org.logo.set" : "org.logo.remove",
      targetType: "organisation",
      targetId: ctx.orgId,
      requestId: ctx.requestId,
      detail: key ? { bytes: bytes?.byteLength } : {},
    });
    return row?.key ?? null;
  });
  if (previous && previous !== key) await storage.delete(previous).catch(() => {});
  return { hasReportLogo: Boolean(key) };
}

// ------------------------------------------------------------------ Profiles and first run

export const ProfilesInput = z
  .array(z.enum(PROFILE_IDS as unknown as [ProfileId, ...ProfileId[]]))
  .max(PROFILE_IDS.length);

export async function saveProfilesFor(ctx: AuthContext, raw: unknown): Promise<ProfileId[]> {
  const parsed = ProfilesInput.safeParse(raw);
  if (!parsed.success) throw badRequest("Choose from the listed notice types.");
  const profiles = [...new Set(parsed.data)];
  await updateOrgMetadata(ctx.container.database, ctx.orgId, (m) => ({ ...m, profiles }));
  await writeAudit(ctx, "org.profiles.update", { profiles });
  return profiles;
}

export const LanguagesInput = z.array(z.string()).max(LANGUAGE_CODES.length);

/** The languages the organisation's notices come in, beside English. */
export async function saveLanguagesFor(ctx: AuthContext, raw: unknown): Promise<string[]> {
  const parsed = LanguagesInput.safeParse(raw);
  if (!parsed.success) throw badRequest("Choose from the listed languages.");
  const languages = knownLanguages(parsed.data);
  if (languages.length !== new Set(parsed.data).size)
    throw badRequest("Choose from the listed languages.");
  await updateOrgMetadata(ctx.container.database, ctx.orgId, (m) => ({ ...m, languages }));
  await writeAudit(ctx, "org.languages.update", { languages });
  return languages;
}

export async function setOnboardingFor(
  ctx: AuthContext,
  state: "completed" | "dismissed",
): Promise<Onboarding> {
  const at = new Date().toISOString();
  const meta = await updateOrgMetadata(ctx.container.database, ctx.orgId, (m) => ({
    ...m,
    onboarding: {
      ...m.onboarding,
      ...(state === "completed" ? { completedAt: at } : { dismissedAt: at }),
    },
  }));
  await writeAudit(ctx, `org.setup.${state}`, {});
  return meta.onboarding;
}
