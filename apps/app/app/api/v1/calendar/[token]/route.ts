/**
 * GET /api/v1/calendar/{token}.ics — the calendar feed (05 §4). The signed
 * token stands in for the session: it is checked, then the person's
 * membership and the policy (`case.view`), then whether it was revoked.
 * Titles and dates only; no amounts or document text. Each person's feeds
 * share the api.token rate limit (L5).
 */
import { getMembership } from "@dueproof/auth";
import { authorize as checkPolicy, PolicyDenied } from "@dueproof/core";
import { withOrg } from "@dueproof/db";
import { renderFeed } from "@/features/deadlines/feed";
import { verifyFeedToken } from "@/features/deadlines/ical";
import { lastFeedRevocation } from "@/features/deadlines/queries";
import { resolveClientIds } from "@/lib/client-access";
import { errorResponse, forbidden, HttpError, notFound } from "@/lib/errors";
import { enforce } from "@/lib/rate-limit";
import { getContainer } from "@/lib/server/container";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    const { token: raw } = await params;
    const token = decodeURIComponent(raw).replace(/\.ics$/, "");
    const container = await getContainer();
    const claim = verifyFeedToken(container.env.AUTH_SECRET, token);
    if (!claim) throw notFound("That calendar feed");
    await enforce(container, "api.token", `${claim.orgId}|${claim.userId}`);
    const membership = await getMembership(container.database, claim.userId, claim.orgId);
    if (!membership) throw notFound("That calendar feed");
    const scope = await resolveClientIds(
      container.database,
      claim.orgId,
      claim.userId,
      membership.role,
    );
    try {
      checkPolicy({ userId: claim.userId, role: membership.role }, "case.view");
    } catch (e) {
      if (e instanceof PolicyDenied) throw forbidden();
      throw e;
    }
    const revokedAt = await lastFeedRevocation({ container }, claim.orgId, claim.userId);
    if (claim.issuedAt <= revokedAt)
      throw new HttpError(410, "This calendar feed was turned off.", "gone");
    const body = await withOrg(container.database, claim.orgId, (tx) =>
      renderFeed(tx, claim, container.env.APP_URL, scope),
    );
    return new Response(body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "cache-control": "private, max-age=900",
        "content-disposition": 'inline; filename="dueproof.ics"',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
