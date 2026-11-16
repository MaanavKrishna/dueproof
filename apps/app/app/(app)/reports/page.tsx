import { NoAccess } from "@/components/NoAccess";
import { loadReportPickers } from "@/features/reports/queries";
import { ReportsIndex } from "@/features/reports/ReportsIndex";
import { may } from "@/lib/can";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports · Dueproof" };

export default async function ReportsPage() {
  const access = await pageAccess("report.view");
  if (!access.ok) return <NoAccess what="Reports" admins={access.admins} />;
  const ctx = access.ctx;
  const pickers = await loadReportPickers(ctx);
  return <ReportsIndex {...pickers} canSeeExposure={may(ctx, "exposure.view")} />;
}
