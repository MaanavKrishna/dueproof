/**
 * Better Auth's routes (/api/auth/*): sign-up, sign-in, sessions, passkeys,
 * two-factor and organisations. Better Auth checks the origin (trusted
 * origins), applies the rate limits and sets the cookies; the sign-up
 * policy lives in packages/auth. authorize() is not used here because these
 * routes are how a session comes to exist.
 */
import { getContainer } from "@/lib/server/container";

export const runtime = "nodejs";

async function handle(request: Request): Promise<Response> {
  const { auth } = await getContainer();
  return auth.handler(request);
}

export { handle as GET, handle as POST };
