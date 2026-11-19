/**
 * GET /api/metrics — Prometheus text format (03 §12). Operator-only: it
 * needs the METRICS_TOKEN bearer token; in production, with no token set,
 * it is off (see metricsAllowed).
 * It reports reachability, queue counts and process figures, never tenant
 * data, so it doesn't call authorize().
 */
import { getContainer } from "@/lib/server/container";
import { metrics, metricsAllowed } from "@/lib/server/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const c = await getContainer();
  if (!metricsAllowed(request, c.env)) return new Response("not found\n", { status: 404 });
  return new Response(await metrics(c), {
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
