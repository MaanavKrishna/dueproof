/** POST /api/v1/uploads — start an upload: dedupe by sha256, get a signed PUT URL. */
import { authorizeRequest } from "@/lib/authorize";
import { badRequest, errorResponse } from "@/lib/errors";
import { initUpload } from "@/lib/upload";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await authorizeRequest(request, "document.upload");
    const body = await request.json().catch(() => {
      throw badRequest("expected a JSON body");
    });
    const result = await initUpload(ctx, body);
    return Response.json(result, { status: result.status === "duplicate" ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
