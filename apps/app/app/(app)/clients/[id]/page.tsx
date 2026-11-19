import { notFound } from "next/navigation";
import { NoAccess } from "@/components/NoAccess";
import { ClientPageView } from "@/features/clients/ClientPageView";
import { type ClientPageData, getClientPage } from "@/features/clients/queries";
import { HttpError } from "@/lib/errors";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await pageAccess("client.view");
  if (!access.ok) return <NoAccess what="This client" admins={access.admins} />;
  const ctx = access.ctx;
  let data: ClientPageData;
  try {
    data = await getClientPage(ctx, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  return <ClientPageView data={data} />;
}
