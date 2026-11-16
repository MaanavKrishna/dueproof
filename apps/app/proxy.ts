/**
 * Next.js Proxy (formerly Middleware): security headers on every response
 * (05 §3) and a request id for logs and audit (authorize() reads it).
 *
 * Pages get a fresh CSP nonce per request; Next.js reads it from the
 * request's Content-Security-Policy header and applies it to its scripts.
 * The Workflow DevKit routes (/.well-known/workflow/*) are left alone: its
 * docs require them outside the proxy, whose body handling breaks them.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import {
  API_CSP,
  commonSecurityHeaders,
  contentSecurityPolicy,
  makeNonce,
  storageOrigins,
} from "@/lib/security/headers";

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function proxy(request: NextRequest): NextResponse {
  const env = getEnv();
  const https = new URL(env.APP_URL).protocol === "https:";
  const common = commonSecurityHeaders({ https, preload: env.DUEPROOF_EDITION === "hosted" });

  const requestHeaders = new Headers(request.headers);
  const incomingId = request.headers.get("x-request-id");
  const requestId = incomingId && REQUEST_ID.test(incomingId) ? incomingId : crypto.randomUUID();
  requestHeaders.set("x-request-id", requestId);

  const isApi = request.nextUrl.pathname.startsWith("/api/");
  let csp = API_CSP;
  if (!isApi) {
    const nonce = makeNonce();
    csp = contentSecurityPolicy({
      nonce,
      dev: env.NODE_ENV === "development",
      https,
      storageOrigins: storageOrigins(env),
    });
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  for (const [k, v] of Object.entries(common)) response.headers.set(k, v);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything but build assets and the Workflow DevKit's own routes.
      source: "/((?!_next/static|_next/image|favicon.ico|\\.well-known/workflow).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
