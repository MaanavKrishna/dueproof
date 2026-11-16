"use server";
/**
 * Web Push opt-in per person and device (05 §7). The browser's
 * subscription (endpoint + keys) is stored against the person; the public
 * VAPID key is handed to the browser to subscribe with.
 *
 *   const { publicKey } = (await pushConfig()).data;
 *   await subscribePush(subscription.toJSON());
 *   await unsubscribePush(subscription.endpoint);
 */
import { and, audit, eq, pushSubscriptions, uuidv7, withOrg } from "@dueproof/db";
import { type ActionResult, runAction } from "@/lib/action";
import { authorize } from "@/lib/authorize";
import { HttpError } from "@/lib/errors";
import { vapidKeys } from "@/lib/push";
import { type PushSubscriptionInput, validSubscription } from "./validate";

/** Whether Web Push is on for this install, and the key browsers subscribe with. */
export async function pushConfig(): Promise<ActionResult<{ enabled: boolean; publicKey: string }>> {
  return runAction("pushConfig", async () => {
    const ctx = await authorize("case.view");
    const env = ctx.container.env;
    return {
      enabled: env.PUSH_ENABLED,
      publicKey: env.PUSH_ENABLED ? vapidKeys(env).publicKey : "",
    };
  });
}

export async function subscribePush(
  input: PushSubscriptionInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction("subscribePush", async () => {
    const ctx = await authorize("case.view");
    if (!ctx.container.env.PUSH_ENABLED)
      throw new HttpError(
        409,
        "An admin has switched phone notifications off for this install.",
        "push_disabled",
      );
    const sub = validSubscription(input);
    return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      // One row per device endpoint: re-subscribing replaces the keys.
      await tx
        .delete(pushSubscriptions)
        .where(
          and(eq(pushSubscriptions.orgId, ctx.orgId), eq(pushSubscriptions.endpoint, sub.endpoint)),
        );
      const id = uuidv7();
      await tx.insert(pushSubscriptions).values({
        id,
        orgId: ctx.orgId,
        userId: ctx.userId,
        endpoint: sub.endpoint,
        keys: sub.keys,
      });
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "push.subscribed",
        targetType: "user",
        targetId: ctx.userId,
        requestId: ctx.requestId,
        // The endpoint's host only: the full URL is a bearer capability.
        detail: { host: new URL(sub.endpoint).host },
      });
      return { id };
    });
  });
}

/** Stop notifications on one device (endpoint), or on all of this person's devices (no endpoint). */
export async function unsubscribePush(
  endpoint?: string,
): Promise<ActionResult<{ removed: number }>> {
  return runAction("unsubscribePush", async () => {
    const ctx = await authorize("case.view");
    return withOrg(ctx.container.database, ctx.orgId, async (tx, scope) => {
      const where = [
        eq(pushSubscriptions.orgId, ctx.orgId),
        eq(pushSubscriptions.userId, ctx.userId),
      ];
      if (typeof endpoint === "string" && endpoint)
        where.push(eq(pushSubscriptions.endpoint, endpoint));
      const gone = await tx
        .delete(pushSubscriptions)
        .where(and(...where))
        .returning({ id: pushSubscriptions.id });
      await audit.write(tx, scope, {
        actor: ctx.userId,
        action: "push.unsubscribed",
        targetType: "user",
        targetId: ctx.userId,
        requestId: ctx.requestId,
        detail: { removed: gone.length, all: !endpoint },
      });
      return { removed: gone.length };
    });
  });
}
