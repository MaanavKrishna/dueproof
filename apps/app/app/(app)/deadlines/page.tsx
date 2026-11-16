import { NoAccess } from "@/components/NoAccess";
import { DeadlinesView, type View } from "@/features/deadlines/DeadlinesView";
import { loadDeadlinesPage } from "@/features/deadlines/queries";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deadlines · Dueproof" };

export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await pageAccess("case.view");
  if (!access.ok) return <NoAccess what="Deadlines" admins={access.admins} />;
  const ctx = access.ctx;
  const sp = await searchParams;
  const view: View = sp.view === "calendar" || sp.view === "timeline" ? sp.view : "list";
  const data = await loadDeadlinesPage(ctx);
  return <DeadlinesView data={data} initialView={view} />;
}
