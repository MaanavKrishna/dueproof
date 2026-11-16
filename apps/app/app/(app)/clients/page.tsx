import { NoAccess } from "@/components/NoAccess";
import { ClientsView } from "@/features/clients/ClientsView";
import { findDuplicates, listClients } from "@/features/clients/queries";
import { may } from "@/lib/can";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients · Dueproof" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await pageAccess("client.view");
  if (!access.ok) return <NoAccess what="Clients" admins={access.admins} />;
  const ctx = access.ctx;
  const sp = await searchParams;
  const [list, duplicates] = await Promise.all([
    listClients(ctx),
    may(ctx, "client.edit") ? findDuplicates(ctx) : Promise.resolve([]),
  ]);
  return (
    <ClientsView
      {...list}
      duplicates={duplicates}
      openNew={sp.new === "1"}
      openImport={sp.import === "1"}
    />
  );
}
