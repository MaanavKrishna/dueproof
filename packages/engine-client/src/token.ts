/**
 * The engine's caller token (03 §3a, 05 §4). Short-lived, HMAC-signed with
 * ENGINE_SHARED_SECRET; services/engine verifies the same scheme.
 *
 *   payload   = {"exp": <unix seconds>, "aud": "engine"}         (JSON)
 *   token     = base64url(payload) + "." + base64url(HMAC-SHA256(secret, base64url(payload)))
 *   header    = Authorization: Bearer <token>
 *
 * base64url is RFC 4648 §5 without padding. The MAC covers the encoded
 * payload string exactly as sent. The engine must reject a token whose
 * `aud` is not "engine", whose `exp` is in the past (allow ≤ 30 s skew), or
 * whose `exp` is more than 10 minutes ahead.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const ENGINE_AUDIENCE = "engine";
export const DEFAULT_TOKEN_TTL_SECONDS = 60;
const MAX_FUTURE_SECONDS = 600;
const SKEW_SECONDS = 30;

export interface EngineTokenPayload {
  exp: number;
  aud: typeof ENGINE_AUDIENCE;
}

function mac(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signEngineToken(
  secret: string,
  options: { ttlSeconds?: number; now?: number } = {},
): string {
  if (!secret || secret.length < 32)
    throw new Error("ENGINE_SHARED_SECRET must be at least 32 characters");
  const nowS = Math.floor((options.now ?? Date.now()) / 1000);
  const ttl = Math.min(options.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS, MAX_FUTURE_SECONDS);
  const payload: EngineTokenPayload = { exp: nowS + ttl, aud: ENGINE_AUDIENCE };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(secret, body).toString("base64url")}`;
}

/** The verifier the engine implements, here for the fake engine and tests. */
export function verifyEngineToken(
  secret: string,
  token: string,
  now: number = Date.now(),
): EngineTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = mac(secret, body);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: Partial<EngineTokenPayload>;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const nowS = Math.floor(now / 1000);
  if (payload.aud !== ENGINE_AUDIENCE || typeof payload.exp !== "number") return null;
  if (payload.exp + SKEW_SECONDS < nowS || payload.exp > nowS + MAX_FUTURE_SECONDS) return null;
  return payload as EngineTokenPayload;
}
