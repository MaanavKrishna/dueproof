import { WorkloadView } from "@/features/reports/OtherReports";
import { loadWorkload } from "@/features/reports/queries";
import { authorizePage } from "@/lib/page-auth";

export const metadata = { title: "Workload · Dueproof" };

export default async function WorkloadPage() {
  const ctx = await authorizePage("report.view", "/reports/workload");
  return <WorkloadView report={await loadWorkload(ctx)} />;
}
