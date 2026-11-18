import { redirect } from "next/navigation";
import { NoAccess } from "@/components/NoAccess";
import { one, orNotFound } from "@/features/reports/load";
import { StatementView } from "@/features/reports/OtherReports";
import { loadClientStatement } from "@/features/reports/queries";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client statement" };

export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const client = one((await searchParams).client);
  // No client chosen: back to Reports to choose one (M10), not "Page not found".
  if (!client) redirect("/reports");
  const access = await pageAccess("report.view");
  if (!access.ok) return <NoAccess what="The client statement" admins={access.admins} />;
  const ctx = access.ctx;
  const report = await orNotFound(() => loadClientStatement(ctx, client));
  return <StatementView report={report} />;
}
