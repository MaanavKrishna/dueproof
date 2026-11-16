import { loadReportPickers } from "@/features/reports/queries";
import { ReportsIndex } from "@/features/reports/ReportsIndex";
import { may } from "@/lib/can";
import { authorizePage } from "@/lib/page-auth";

export const metadata = { title: "Reports · Dueproof" };

export default async function ReportsPage() {
  const ctx = await authorizePage("report.view", "/reports");
  const pickers = await loadReportPickers(ctx);
  return <ReportsIndex {...pickers} canSeeExposure={may(ctx, "exposure.view")} />;
}
