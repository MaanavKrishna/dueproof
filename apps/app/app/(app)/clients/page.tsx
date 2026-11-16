import { ClientsView } from "@/features/clients/ClientsView";
import { findDuplicates, listClients } from "@/features/clients/queries";
import { may } from "@/lib/can";
import { authorizePage } from "@/lib/page-auth";

export const metadata = { title: "Clients · Dueproof" };

export default async function ClientsPage() {
  const ctx = await authorizePage("client.view", "/clients");
  const [list, duplicates] = await Promise.all([
    listClients(ctx),
    may(ctx, "client.edit") ? findDuplicates(ctx) : Promise.resolve([]),
  ]);
  return <ClientsView {...list} duplicates={duplicates} />;
}
