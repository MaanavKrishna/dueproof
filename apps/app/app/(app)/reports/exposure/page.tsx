import { one } from "@/features/reports/load";
import { ExposureReportView } from "@/features/reports/OtherReports";
import { loadExposureReport } from "@/features/reports/queries";
import { authorizePage } from "@/lib/page-auth";

export const metadata = { title: "Exposure · Dueproof" };

export default async function ExposurePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await authorizePage("exposure.view", "/reports/exposure");
  const client = one((await searchParams).client);
  return <ExposureReportView report={await loadExposureReport(ctx, client)} />;
}
