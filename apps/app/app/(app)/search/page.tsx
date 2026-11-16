import { PermissionDenied } from "@/components/PermissionDenied";
import { search } from "@/features/search/queries";
import { SearchView } from "@/features/search/SearchView";
import { HttpError } from "@/lib/errors";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Search · Dueproof" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const gate = await pageAccess("case.view");
  if (!gate.ok) return <PermissionDenied admins={gate.admins} what="search" />;
  try {
    return <SearchView query={q.trim()} hits={await search(gate.ctx, q)} error={null} />;
  } catch (e) {
    if (e instanceof HttpError && e.status === 400)
      return <SearchView query={q.trim()} hits={[]} error={e.message} />;
    throw e;
  }
}
