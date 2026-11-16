import { notFound } from "next/navigation";
import { NoAccess } from "@/components/NoAccess";
import { one, orNotFound } from "@/features/reports/load";
import { HearingPackView } from "@/features/reports/OtherReports";
import { loadHearingPack } from "@/features/reports/queries";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hearing pack · Dueproof" };

export default async function HearingPackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caseId = one((await searchParams).case);
  if (!caseId) notFound();
  const access = await pageAccess("case.view");
  if (!access.ok) return <NoAccess what="The hearing pack" admins={access.admins} />;
  const ctx = access.ctx;
  const pack = await orNotFound(() => loadHearingPack(ctx, caseId));
  return <HearingPackView pack={pack} />;
}
