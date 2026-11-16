/** GET /api/v1/documents/{id} — the document with its findings, evidence, deadlines and history. */

import { authorizeRequest } from "@/lib/authorize";
import { getDocumentDetail } from "@/lib/documents";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await authorizeRequest(request, "case.view");
    const { id } = await params;
    return Response.json(await getDocumentDetail(ctx, id), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
