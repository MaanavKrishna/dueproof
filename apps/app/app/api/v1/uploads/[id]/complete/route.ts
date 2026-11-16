/** POST /api/v1/uploads/{id}/complete — verify the uploaded file and start processing. */
import { authorizeRequest } from "@/lib/authorize";
import { errorResponse } from "@/lib/errors";
import { completeUpload } from "@/lib/upload";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const ctx = await authorizeRequest(request, "document.upload");
    const { id } = await params;
    const result = await completeUpload(ctx, id);
    return Response.json(result, { status: result.status === "quarantined" ? 422 : 200 });
  } catch (e) {
    return errorResponse(e);
  }
}
