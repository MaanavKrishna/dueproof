import { can } from "@dueproof/core";
import { PermissionDenied } from "@/components/PermissionDenied";
import { NoticesView } from "@/features/notices/NoticesView";
import { loadNotices } from "@/features/notices/queries";
import { gatePage } from "@/lib/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notices · Dueproof" };

export default async function NoticesPage() {
  const gate = await gatePage("case.view", undefined, "/notices");
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
