/**
 * Better Auth's routes (/api/auth/*): sign-up, sign-in, sessions, passkeys,
 * two-factor and organisations. Better Auth checks the origin (trusted
 * origins), applies its own rate limits and sets the cookies; the sign-up
 * policy lives in packages/auth. On top of that, sign-in and sign-up get the
 * Postgres-backed limits of 05 §3a (per IP, and failed sign-ins per
 * account). authorize() is not used here because these routes are how a
 * session comes to exist.
 */
import { limitAuth } from "@/lib/rate-limit";
import { getContainer } from "@/lib/server/container";

export const runtime = "nodejs";

async function get(request: Request): Promise<Response> {
  const { auth } = await getContainer();
  return auth.handler(request);
}

async function post(request: Request): Promise<Response> {
  const c = await getContainer();
  return limitAuth(c, request, (r) => c.auth.handler(r));
}

export { get as GET, post as POST };
