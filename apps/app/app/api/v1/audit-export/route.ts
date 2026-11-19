/**
 * GET /api/v1/audit-export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=jsonl|csv&part=records|report
 *
 * The organisation's audit trail with its hash chain (Business: needs ee/
 * and a licence with `audit-export`), or the verification report for the
 * same export. Owners and admins (`audit.view`); every download is audited.
 */
import { authorizeRequest } from "@/lib/authorize";
import { exportAuditFor, parseAuditExportQuery } from "@/lib/business";
import { errorResponse } from "@/lib/errors";
import { limitRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await authorizeRequest(request, "audit.view");
    await limitRequest(request, "export", ctx);
    const req = parseAuditExportQuery(new URL(request.url).searchParams);
    const result = await exportAuditFor(ctx, req);
    const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
    if (req.part === "report") {
      const name = result.filename.replace(/\.(jsonl|csv)$/, ".verification.json");
      return new Response(`${JSON.stringify(result.report, null, 2)}\n`, {
        headers: {
          ...headers,
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${name}"`,
        },
      });
    }
    return new Response(result.body, {
      headers: {
        ...headers,
        "content-type": result.contentType,
        "content-disposition": `attachment; filename="${result.filename}"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
