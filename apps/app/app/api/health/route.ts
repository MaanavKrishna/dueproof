/**
 * GET /api/health — for the reverse proxy, Docker and uptime tools (03 §12).
 * Database and engine reachability with timings, version and edition. No
 * secrets, no tenant data, so it doesn't call authorize(); Caddy doesn't
 * expose it outside the server by default.
 *
 * 200 when the database answers (status "ok", or "degraded" when the engine
 * doesn't); 503 when the database doesn't.
 */
import { errorResponse } from "@/lib/errors";
import { getContainer } from "@/lib/server/container";
import { health } from "@/lib/server/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const h = await health(await getContainer());
    return Response.json(h, {
      status: h.status === "down" ? 503 : 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    // The container itself failed to start (bad environment, database down at boot).
    if (process.env.NODE_ENV !== "production") return errorResponse(e);
    return Response.json(
      { status: "down" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
