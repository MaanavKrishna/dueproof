import { NoAccess } from "@/components/NoAccess";
import { WorkloadView } from "@/features/reports/OtherReports";
import { loadWorkload } from "@/features/reports/queries";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workload" };

export default async function WorkloadPage() {
  const access = await pageAccess("report.view");
  if (!access.ok) return <NoAccess what="The workload report" admins={access.admins} />;
  const ctx = access.ctx;
  return <WorkloadView report={await loadWorkload(ctx)} />;
}
