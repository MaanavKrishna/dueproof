import { can } from "@dueproof/core";
import { PermissionDenied } from "@/components/PermissionDenied";
import { NoticesView } from "@/features/notices/NoticesView";
import { loadNotices } from "@/features/notices/queries";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notices" };

export default async function NoticesPage() {
  const gate = await pageAccess("case.view");
  if (!gate.ok) return <PermissionDenied admins={gate.admins} what="Notices" />;
  const data = await loadNotices(gate.ctx);
  return (
    <NoticesView
      data={data}
      canAssign={can(gate.ctx, "case.assign")}
      canMove={can(gate.ctx, "case.change_stage")}
    />
  );
}
