import { can } from "@dueproof/core";
import { PermissionDenied } from "@/components/PermissionDenied";
import { InboxView } from "@/features/inbox/InboxView";
import { loadInbox } from "@/features/inbox/queries";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox · Dueproof" };

export default async function InboxPage() {
  const gate = await pageAccess("case.view");
  if (!gate.ok) return <PermissionDenied admins={gate.admins} what="the Inbox" />;
  const { ctx } = gate;
  const data = await loadInbox(ctx);
  return (
    <InboxView
      data={data}
      canReview={can(ctx, "finding.review")}
      canFile={can(ctx, "case.create")}
    />
  );
}
