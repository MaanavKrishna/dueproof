/** Checks a browser push subscription before it is stored. Pure. */
import { badRequest } from "@/lib/errors";
import { isPushServiceEndpoint } from "@/lib/push";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** A push service endpoint: https, on a known push service's host (lib/push's allowlist). */
export function validSubscription(input: unknown): PushSubscriptionInput {
  const s = input as Partial<PushSubscriptionInput> | null;
  if (!s || typeof s.endpoint !== "string" || s.endpoint.length > 1000)
    throw badRequest("That isn't a push subscription.");
  let url: URL;
  try {
    url = new URL(s.endpoint);
  } catch {
    throw badRequest("That isn't a push subscription.");
  }
  if (url.protocol !== "https:") throw badRequest("Push endpoints must use https.");
  if (!isPushServiceEndpoint(url.toString())) throw badRequest("That push endpoint isn't allowed.");
  const p256dh = s.keys?.p256dh;
  const auth = s.keys?.auth;
  if (
    typeof p256dh !== "string" ||
    typeof auth !== "string" ||
    !B64URL.test(p256dh) ||
    !B64URL.test(auth) ||
    p256dh.length > 200 ||
    auth.length > 100
  )
    throw badRequest("The subscription's keys are missing.");
  return { endpoint: url.toString(), keys: { p256dh, auth } };
}
