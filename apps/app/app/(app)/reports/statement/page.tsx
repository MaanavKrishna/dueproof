import { notFound } from "next/navigation";
import { one, orNotFound } from "@/features/reports/load";
import { StatementView } from "@/features/reports/OtherReports";
import { loadClientStatement } from "@/features/reports/queries";
import { authorizePage } from "@/lib/page-auth";

export const metadata = { title: "Client statement · Dueproof" };

export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const client = one((await searchParams).client);
  if (!client) notFound();
  const ctx = await authorizePage("report.view", `/reports/statement?client=${client}`);
  const report = await orNotFound(() => loadClientStatement(ctx, client));
  return <StatementView report={report} />;
}
