import { notFound } from "next/navigation";
import { ClientPageView } from "@/features/clients/ClientPageView";
import { type ClientPageData, getClientPage } from "@/features/clients/queries";
import { HttpError } from "@/lib/errors";
import { authorizePage } from "@/lib/page-auth";

export const metadata = { title: "Client · Dueproof" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await authorizePage("client.view", `/clients/${id}`);
  let data: ClientPageData;
  try {
    data = await getClientPage(ctx, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  return <ClientPageView data={data} />;
}
