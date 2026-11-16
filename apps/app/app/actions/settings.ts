"use server";
/**
 * Server actions for Settings → Me and Organisation, display preferences and
 * first-run setup. Each starts with authorize() and each change is audited
 * (lib/settings.ts).
 *
 *   await updateProfile({ name: "Priya Sharma" });
 *   await saveOrganisation({ name, timezone, fiscalYearStartMonth: 4 });
 *   await saveHolidays([{ day: "2026-01-26", name: "Republic Day" }]);
 */
import { cookies } from "next/headers";
import { type ActionResult, runAction } from "@/lib/action-result";
import { authorize } from "@/lib/authorize";
import { badRequest } from "@/lib/errors";
import type { Onboarding, ProfileId } from "@/lib/org-metadata";
import {
  DENSITY_COOKIE,
  PREFS_MAX_AGE,
  type Preferences,
  parseDensity,
  parseTheme,
  THEME_COOKIE,
} from "@/lib/preferences";
import {
  type HolidayRow,
  type OrganisationView,
  saveHolidaysFor,
  saveOrganisationFor,
  saveProfilesFor,
  setOnboardingFor,
  setReportLogoFor,
  updateProfileFor,
} from "@/lib/settings";

export async function updateProfile(input: {
  name: string;
}): Promise<ActionResult<{ name: string }>> {
  return runAction("profile", async () => updateProfileFor(await authorize("team.view"), input));
}

/** Theme and density live in cookies for this browser (and localStorage, client side). */
export async function setPreferences(
  input: Partial<Preferences>,
): Promise<ActionResult<Partial<Preferences>>> {
  return runAction("preferences", async () => {
    await authorize("team.view");
    const jar = await cookies();
    const out: Partial<Preferences> = {};
    const common = { path: "/", maxAge: PREFS_MAX_AGE, sameSite: "lax" as const, httpOnly: false };
    if (input.theme !== undefined) {
      const theme = parseTheme(input.theme);
      if (!theme) throw badRequest("Choose light, dark or system.");
      jar.set(THEME_COOKIE, theme, common);
      out.theme = theme;
    }
    if (input.density !== undefined) {
      const density = parseDensity(input.density);
      if (!density) throw badRequest("Choose comfortable or compact.");
      jar.set(DENSITY_COOKIE, density, common);
      out.density = density;
    }
    return out;
  });
}

export async function saveOrganisation(input: unknown): Promise<ActionResult<OrganisationView>> {
  return runAction("organisation", async () =>
    saveOrganisationFor(await authorize("org.manage_settings"), input),
  );
}

export async function saveHolidays(input: unknown): Promise<ActionResult<HolidayRow[]>> {
  return runAction("holidays", async () =>
    saveHolidaysFor(await authorize("org.manage_settings"), input),
  );
}

export async function uploadReportLogo(
  form: FormData,
): Promise<ActionResult<{ hasReportLogo: boolean }>> {
  return runAction("report logo", async () => {
    const ctx = await authorize("org.manage_settings");
    const file = form.get("logo");
    if (!(file instanceof Blob) || file.size === 0) throw badRequest("Choose an image.");
    return setReportLogoFor(ctx, new Uint8Array(await file.arrayBuffer()));
  });
}

export async function removeReportLogo(): Promise<ActionResult<{ hasReportLogo: boolean }>> {
  return runAction("report logo", async () =>
    setReportLogoFor(await authorize("org.manage_settings"), null),
  );
}

export async function saveProfiles(profiles: unknown): Promise<ActionResult<ProfileId[]>> {
  return runAction("profiles", async () =>
    saveProfilesFor(await authorize("org.manage_settings"), profiles),
  );
}

export async function finishSetup(
  state: "completed" | "dismissed",
): Promise<ActionResult<Onboarding>> {
  return runAction("setup", async () => {
    if (state !== "completed" && state !== "dismissed") throw badRequest("Unknown setup state.");
    return setOnboardingFor(await authorize("org.manage_settings"), state);
  });
}
