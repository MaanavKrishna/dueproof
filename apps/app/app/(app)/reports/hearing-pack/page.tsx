import { redirect } from "next/navigation";
import { NoAccess } from "@/components/NoAccess";
import { one, orNotFound } from "@/features/reports/load";
import { HearingPackView } from "@/features/reports/OtherReports";
import { loadHearingPack } from "@/features/reports/queries";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hearing pack" };

export default async function HearingPackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caseId = one((await searchParams).case);
  // No case chosen: back to Reports to choose one (M10), not "Page not found".
  if (!caseId) redirect("/reports");
  const access = await pageAccess("case.view");
  if (!access.ok) return <NoAccess what="The hearing pack" admins={access.admins} />;
  const ctx = access.ctx;
  const pack = await orNotFound(() => loadHearingPack(ctx, caseId));
  return <HearingPackView pack={pack} />;
}
