/**
 * GET /api/cron/daily — the morning digest, notifications and escalation
 * (features/reminders/daily.ts). Called by Vercel Cron (hosted) or the
 * self-hosted scheduler with `Authorization: Bearer $CRON_SECRET`. There is
 * no user session here: the shared secret is the authorisation, compared in
 * constant time, and the route is off when CRON_SECRET is unset.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { runDaily } from "@/features/reminders/daily";
import { errorResponse, HttpError } from "@/lib/errors";
import { getContainer } from "@/lib/server/container";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorizeCron(request: Request, secret: string | undefined): void {
  if (!secret) throw new HttpError(404, "Not found.", "not_found");
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  if (!timingSafeEqual(a, b)) throw new HttpError(401, "Not authorised.", "unauthorised");
}

export async function GET(request: Request): Promise<Response> {
  try {
    const container = await getContainer();
    authorizeCron(request, container.env.CRON_SECRET);
    const result = await runDaily(container);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
