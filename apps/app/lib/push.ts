/**
 * Web Push sender (03 §5, 05 §7). The install signs with its own VAPID key
 * pair, so a self-hosted server needs no relay. Payloads never carry
 * document text, client names or amounts: only a short line such as "A
 * deadline needs attention" and a path in the app, which fetches the rest
 * after sign-in. Subscriptions the push service reports gone are removed.
 */
import "server-only";
import { createECDH, createHmac } from "node:crypto";
import { and, type Database, eq, pushSubscriptions, withOrg } from "@dueproof/db";
import type { Env } from "./env";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const b64url = (b: Buffer) => b.toString("base64url");

/**
 * The install's VAPID pair: from the environment, or derived from
 * AUTH_SECRET (a P-256 private scalar from an HMAC), stable across restarts.
 */
export function vapidKeys(env: Env): VapidKeys {
  const subject =
    env.VAPID_SUBJECT ??
    (env.APP_URL.startsWith("https:") ? env.APP_URL : "mailto:admin@dueproof.local");
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject };
  }
  const ecdh = createECDH("prime256v1");
  // A 256-bit HMAC is below the curve order with overwhelming probability; retry with a counter if not.
  for (let i = 0; i < 8; i++) {
    const scalar = createHmac("sha256", env.AUTH_SECRET).update(`dueproof:vapid:${i}`).digest();
    try {
      ecdh.setPrivateKey(scalar);
      return {
        publicKey: b64url(ecdh.getPublicKey()),
        privateKey: b64url(ecdh.getPrivateKey()),
        subject,
      };
    } catch {
      // Out of range: try the next counter.
    }
  }
  throw new Error("Could not derive a VAPID key pair");
}

export interface PushMessage {
  /** Short and generic: "A deadline needs attention". */
  title: string;
  body?: string;
  /** Path in the app to open, e.g. "/deadlines". */
  url: string;
  tag?: string;
}

/**
 * The push services browsers actually use. An endpoint must be on one of
 * these hosts (exactly, or a subdomain of it), over https on the default
 * port: the server POSTs to it, so an allowlist is what stops a
 * subscription from pointing the server at its own network (security
 * review L2). Checked when a subscription is stored and again before each
 * send, so rows stored before the check are skipped and removed.
 *
 * - fcm.googleapis.com: Chrome, Edge (Chromium), Opera, Samsung Internet
 * - push.services.mozilla.com: Firefox (autopush, updates.push.services.mozilla.com)
 * - push.apple.com: Safari (web.push.apple.com)
 * - notify.windows.com: Windows Notification Service (wns2-*.notify.windows.com)
 */
export const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
] as const;

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** What sends one message; replaced in tests. Resolves the HTTP status. */
export type PushTransport = (
  sub: PushSubscriptionJson,
  payload: string,
  vapid: VapidKeys,
) => Promise<number>;

const webPushTransport: PushTransport = async (sub, payload, vapid) => {
  const webpush = (await import("web-push")).default;
  try {
    const res = await webpush.sendNotification(sub, payload, {
      vapidDetails: vapid,
      TTL: 60 * 60 * 12,
      urgency: "normal",
    });
    return res.statusCode;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (typeof status === "number") return status;
    throw e;
  }
};

let transport: PushTransport = webPushTransport;
/** For tests. */
export function setPushTransport(t: PushTransport | undefined): void {
  transport = t ?? webPushTransport;
}

export interface SendResult {
  sent: number;
  removed: number;
  failed: number;
}

/** Send to every device a person has opted in on. Never throws for one bad endpoint. */
export async function sendPushToUser(
  c: { database: Database; env: Env },
  orgId: string,
  userId: string,
  message: PushMessage,
): Promise<SendResult> {
  const result: SendResult = { sent: 0, removed: 0, failed: 0 };
  if (!c.env.PUSH_ENABLED) return result;
  const subs = await withOrg(c.database, orgId, (tx) =>
    tx
      .select()
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.orgId, orgId), eq(pushSubscriptions.userId, userId))),
  );
  if (!subs.length) return result;
  const vapid = vapidKeys(c.env);
  const payload = JSON.stringify({
    title: message.title,
    body: message.body ?? "",
    url: message.url.startsWith("/") ? message.url : "/",
    tag: message.tag ?? "dueproof",
  });
  const gone: string[] = [];
  for (const s of subs) {
    if (!isPushServiceEndpoint(s.endpoint)) {
      gone.push(s.id);
      continue;
    }
    try {
      const status = await transport(
        { endpoint: s.endpoint, keys: s.keys as PushSubscriptionJson["keys"] },
        payload,
        vapid,
      );
      if (status === 404 || status === 410) gone.push(s.id);
      else if (status >= 200 && status < 300) result.sent += 1;
      else result.failed += 1;
    } catch {
      result.failed += 1;
    }
  }
  if (gone.length) {
    await withOrg(c.database, orgId, async (tx) => {
      for (const id of gone) {
        await tx
          .delete(pushSubscriptions)
          .where(and(eq(pushSubscriptions.orgId, orgId), eq(pushSubscriptions.id, id)));
      }
    });
    result.removed = gone.length;
  }
  return result;
}
