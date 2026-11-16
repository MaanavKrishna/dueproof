/** /notices/{id} (links from Deadlines, Clients and notifications) is the case page at /cases/{id}. */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NoticeRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const qs = new URLSearchParams(await searchParams).toString();
  redirect(`/cases/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`);
}
