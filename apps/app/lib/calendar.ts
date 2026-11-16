/** The organisation's working calendar, with defaults when it has no settings yet. */
import "server-only";
import { type Database, eq, holidays, orgSettings, withOrg } from "@dueproof/db";

/** Working days when the organisation has no settings row: Monday to Saturday (the db default). */
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];

export interface OrgCalendar {
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  workingDays: number[];
  holidays: string[];
  locale: string;
  timezone: string;
}

export async function loadOrgCalendar(
  c: { database: Database },
  orgId: string,
): Promise<OrgCalendar> {
  return withOrg(c.database, orgId, async (tx) => {
    const [settings] = await tx
      .select()
      .from(orgSettings)
      .where(eq(orgSettings.orgId, orgId))
      .limit(1);
    const rows = await tx
      .select({ day: holidays.day })
      .from(holidays)
      .where(eq(holidays.orgId, orgId));
    return {
      holidays: rows.map((r) => r.day).sort(),
      workingDays: settings?.workingDays?.length ? settings.workingDays : DEFAULT_WORKING_DAYS,
      locale: settings?.locale ?? "en-IN",
      timezone: settings?.timezone ?? "Asia/Kolkata",
    };
  });
}
