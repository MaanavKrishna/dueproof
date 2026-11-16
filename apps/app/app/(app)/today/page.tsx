import { PermissionDenied } from "@/components/PermissionDenied";
import { loadToday, summarySentence } from "@/features/today/queries";
import { TodayView } from "@/features/today/TodayView";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today · Dueproof" };

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const gate = await pageAccess("case.view");
  if (!gate.ok) return <PermissionDenied admins={gate.admins} what="Today" />;
  const { scope } = await searchParams;
  const data = await loadToday(gate.ctx, scope ?? null);
  return <TodayView data={data} summary={summarySentence(data)} />;
}
