import { DeadlinesView, type View } from "@/features/deadlines/DeadlinesView";
import { loadDeadlinesPage } from "@/features/deadlines/queries";
import { authorizePage } from "@/lib/page-auth";

export const metadata = { title: "Deadlines · Dueproof" };

export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await authorizePage("case.view", "/deadlines");
  const sp = await searchParams;
  const view: View = sp.view === "calendar" || sp.view === "timeline" ? sp.view : "list";
  const data = await loadDeadlinesPage(ctx);
  return <DeadlinesView data={data} initialView={view} />;
}
