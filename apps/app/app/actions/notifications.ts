"use server";
/**
 * The signed-in person's new notifications, for the desktop app's OS alerts.
 * Its webviews have no Web Push, so the app polls this while it runs and
 * raises each one with `new Notification()`, which the desktop shell bridges
 * to the OS (apps/desktop, "Native extras").
 *
 * Only the generic line goes to the OS, as with Web Push (05 §7): an alert
 * can show on a locked screen, so no client names, amounts or text.
 */
import { and, asc, eq, gt, notifications, withOrg } from "@dueproof/db";
import { z } from "zod";
import { type ActionResult, runAction } from "@/lib/action";
import { authorize } from "@/lib/authorize";
import { type NotificationKind, PUSH_LINES } from "@/lib/notify";

export interface DesktopAlert {
  id: string;
  title: string;
  href: string;
  createdAt: string;
}

const Since = z.iso.datetime({ offset: true });

/** Notifications for this person created after `since` (oldest first, at most 20). */
export async function newNotifications(since: string): Promise<ActionResult<DesktopAlert[]>> {
  return runAction("newNotifications", async () => {
    const ctx = await authorize("case.view");
    const after = new Date(Since.parse(since));
    const rows = await withOrg(ctx.container.database, ctx.orgId, (tx) =>
      tx
        .select({
          id: notifications.id,
          kind: notifications.kind,
          payload: notifications.payload,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.orgId, ctx.orgId),
            eq(notifications.userId, ctx.userId),
            gt(notifications.createdAt, after),
          ),
        )
        .orderBy(asc(notifications.createdAt))
        .limit(20),
    );
    return rows.map((r) => {
      const href = (r.payload as { href?: unknown }).href;
      return {
        id: r.id,
        title: PUSH_LINES[r.kind as NotificationKind] ?? "Dueproof needs your attention",
        href: typeof href === "string" && href.startsWith("/") ? href : "/today",
        createdAt: r.createdAt.toISOString(),
      };
    });
  });
}
