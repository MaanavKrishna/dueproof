import { notFound } from "next/navigation";
import { PermissionDenied } from "@/components/PermissionDenied";
import { CaseView } from "@/features/cases/CaseView";
import { loadCase } from "@/features/cases/queries";
import { HttpError } from "@/lib/errors";
import { pageAccess } from "@/lib/server/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Case · Dueproof" };

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string; finding?: string; page?: string }>;
}) {
  const { id } = await params;
  const gate = await pageAccess("case.view");
  if (!gate.ok) return <PermissionDenied admins={gate.admins} what="this case" />;
  const sp = await searchParams;
  let data: Awaited<ReturnType<typeof loadCase>>;
  try {
    data = await loadCase(gate.ctx, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const page = Number.parseInt(sp.page ?? "", 10);
  return (
    <CaseView
      data={data}
      initial={{
        ...(sp.doc ? { documentId: sp.doc } : {}),
        ...(sp.finding ? { findingId: sp.finding } : {}),
        ...(Number.isFinite(page) && page > 0 ? { page } : {}),
      }}
    />
  );
}
