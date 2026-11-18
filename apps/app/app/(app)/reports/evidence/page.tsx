import { redirect } from "next/navigation";
import { NoAccess } from "@/components/NoAccess";
import { EvidenceReportView } from "@/features/reports/EvidenceReportView";
import { one, orNotFound } from "@/features/reports/load";
import { loadEvidenceReport } from "@/features/reports/queries";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Evidence report · Dueproof" };

export default async function EvidenceReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const scope = {
    ...(one(sp.case) ? { caseId: one(sp.case) as string } : {}),
    ...(one(sp.client) ? { clientId: one(sp.client) as string } : {}),
    ...(one(sp.range) ? { range: one(sp.range) as string } : {}),
  };
  const q = new URLSearchParams(
    Object.entries({ case: scope.caseId, client: scope.clientId, range: scope.range }).filter(
      (e): e is [string, string] => Boolean(e[1]),
    ),
  ).toString();
  // Nothing chosen: back to Reports to choose a case, a client or a date range (M10).
  if (!q) redirect("/reports");
  const access = await pageAccess("report.view");
  if (!access.ok) return <NoAccess what="The evidence report" admins={access.admins} />;
  const ctx = access.ctx;
  const report = await orNotFound(() => loadEvidenceReport(ctx, scope));
  return <EvidenceReportView report={report} csvHref={`/api/v1/reports/evidence.csv?${q}`} />;
}
