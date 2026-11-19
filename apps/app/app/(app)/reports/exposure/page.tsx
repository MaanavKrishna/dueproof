import { NoAccess } from "@/components/NoAccess";
import { one } from "@/features/reports/load";
import { ExposureReportView } from "@/features/reports/OtherReports";
import { loadExposureReport } from "@/features/reports/queries";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exposure" };

export default async function ExposurePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await pageAccess("exposure.view");
  if (!access.ok) return <NoAccess what="The exposure report" admins={access.admins} />;
  const ctx = access.ctx;
  const client = one((await searchParams).client);
  return <ExposureReportView report={await loadExposureReport(ctx, client)} />;
}
