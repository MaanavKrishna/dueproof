/**
 * /notices/{id} (links from Deadlines, Clients, notifications and the upload
 * tray) is the case page at /cases/{id}. The id may also be a document's: then
 * it is the case the document is filed in, or the Inbox if it isn't filed yet.
 */
import { notFound, redirect } from "next/navigation";
import { PermissionDenied } from "@/components/PermissionDenied";
import { locate } from "@/features/cases/queries";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";

export default async function NoticeRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const gate = await pageAccess("case.view");
  if (!gate.ok) return <PermissionDenied admins={gate.admins} what="this case" />;
  const where = await locate(gate.ctx, id);
  if (!where) notFound();
  if ("inbox" in where) redirect("/inbox");
  const qs = new URLSearchParams(await searchParams);
  if (where.documentId && !qs.has("doc")) qs.set("doc", where.documentId);
  const q = qs.toString();
  redirect(`/cases/${encodeURIComponent(where.caseId)}${q ? `?${q}` : ""}`);
}
