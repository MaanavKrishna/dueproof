import { notFound } from "next/navigation";
import { one, orNotFound } from "@/features/reports/load";
import { HearingPackView } from "@/features/reports/OtherReports";
import { loadHearingPack } from "@/features/reports/queries";
import { authorizePage } from "@/lib/page-auth";

export const metadata = { title: "Hearing pack · Dueproof" };

export default async function HearingPackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caseId = one((await searchParams).case);
  if (!caseId) notFound();
  const ctx = await authorizePage("case.view", `/reports/hearing-pack?case=${caseId}`);
  const pack = await orNotFound(() => loadHearingPack(ctx, caseId));
  return <HearingPackView pack={pack} />;
}
