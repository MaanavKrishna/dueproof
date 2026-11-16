import type { Metadata } from "next";
import { NoAccessSettings } from "@/features/settings/NoAccessSettings";
import { SystemSettings } from "@/features/settings/SystemSettings";
import { pageAccess, requireViewer, settingsChrome } from "@/lib/server/page";
import { getSystemFor } from "@/lib/system";

export const metadata: Metadata = { title: "Settings · System" };

export default async function SystemSettingsPage() {
  const viewer = await requireViewer();
  const [chrome, access] = await Promise.all([settingsChrome(viewer), pageAccess("audit.view")]);
  if (!access.ok)
    return (
      <NoAccessSettings chrome={chrome} section="system" what="System" admins={access.admins} />
    );
  const s = await getSystemFor(access.ctx);
  const { database, engine } = s.health.checks;
  return (
    <SystemSettings
      chrome={chrome}
      data={{
        status: s.health.status,
        database: {
          ok: database.ok,
          ms: database.ms,
          ...(database.error ? { error: database.error } : {}),
        },
        engine: {
          ok: engine.ok,
          ms: engine.ms,
          mode: access.ctx.container.env.ENGINE_MODE ?? "fake",
          ...(engine.error ? { error: engine.error } : {}),
          ...(engine.translation !== undefined ? { translation: engine.translation } : {}),
        },
        edition: s.edition,
        version: s.version,
        backups: s.backups,
        outbound: s.outbound,
        audit: {
          rows: s.audit.rows.map((r) => ({
            id: r.id,
            at: r.at,
            actorName: r.actorName,
            action: r.action,
            targetType: r.targetType,
            detail: null,
          })),
          verify: s.audit.verify,
        },
      }}
    />
  );
}
