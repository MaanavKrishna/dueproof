/**
 * Better Auth's routes (/api/auth/*): sign-up, sign-in, sessions, passkeys,
 * two-factor and password reset. Better Auth checks the origin (trusted
 * origins), applies its own rate limits and sets the cookies; the sign-up
 * policy lives in packages/auth. On top of that, sign-in and sign-up get the
 * Postgres-backed limits of 05 §3a (per IP, and failed sign-ins per account
 * and IP). authorize() is not used here because these routes are how a
 * session comes to exist.
 *
 * Only the endpoints a browser needs are served (H2, `isClientAuthPath`):
 * the organisation plugin's member, role, invitation and metadata endpoints
 * answer 404 here, and again inside Better Auth. Those changes go through
 * the app's own server actions (app/actions/team.ts), which call
 * authorize(), check the role hierarchy and write audit entries.
 */
import { isClientAuthPath } from "@dueproof/auth";
import { limitAuth } from "@/lib/rate-limit";
import { getContainer } from "@/lib/server/container";

export const runtime = "nodejs";

const PREFIX = "/api/auth";

function allowed(request: Request): boolean {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(`${PREFIX}/`)) return false;
  return isClientAuthPath(path.slice(PREFIX.length));
}

const notFound = () => Response.json({ code: "NOT_FOUND", message: "Not found." }, { status: 404 });

async function get(request: Request): Promise<Response> {
  if (!allowed(request)) return notFound();
  const { auth } = await getContainer();
  return auth.handler(request);
}

async function post(request: Request): Promise<Response> {
  if (!allowed(request)) return notFound();
  const c = await getContainer();
  return limitAuth(c, request, (r) => c.auth.handler(r));
}

export { get as GET, post as POST };
