/**
 * The notification centre (the sidebar bell): the signed-in person's own
 * notifications in this organisation, newest first, and marking them read.
 * Every query runs in an org-scoped transaction and is limited to the
 * caller's user id, so nobody sees or clears anyone else's.
 */
import "server-only";
import { and, desc, eq, inArray, isNull, notifications, withOrg } from "@dueproof/db";
import { z } from "zod";
import type { AuthContext } from "./authorize";
import { badRequest } from "./errors";
import { type NotificationKind, PUSH_LINES } from "./notify";

export interface InboxNotification {
  id: string;
  kind: string;
  title: string;
  /** In-app path to open; always starts with "/". */
  href: string;
  createdAt: string;
  read: boolean;
}

/** How many the bell shows. */
export const BELL_LIMIT = 30;

function safeHref(v: unknown): string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/today";
}

export async function listNotificationsFor(
  ctx: AuthContext,
  limit = BELL_LIMIT,
): Promise<InboxNotification[]> {
  const rows = await withOrg(ctx.container.database, ctx.orgId, (tx) =>
    tx
      .select({
        id: notifications.id,
        kind: notifications.kind,
        payload: notifications.payload,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(eq(notifications.orgId, ctx.orgId), eq(notifications.userId, ctx.userId)))
      .orderBy(desc(notifications.createdAt))
      .limit(Math.min(Math.max(1, limit), 100)),
  );
  return rows.map((r) => {
    const payload = (r.payload ?? {}) as { title?: unknown; href?: unknown };
    return {
      id: r.id,
      kind: r.kind,
      title:
        typeof payload.title === "string" && payload.title
          ? payload.title
          : (PUSH_LINES[r.kind as NotificationKind] ?? "Dueproof needs your attention"),
      href: safeHref(payload.href),
      createdAt: r.createdAt.toISOString(),
      read: r.readAt !== null,
    };
  });
}

const Ids = z.array(z.string().min(1).max(64)).max(200).nullable();

/** Marks the caller's notifications read: these ids, or every unread one when null. */
export async function markReadFor(ctx: AuthContext, raw: unknown): Promise<{ marked: number }> {
  const parsed = Ids.safeParse(raw);
  if (!parsed.success) throw badRequest("Choose notifications to mark as read.");
  const ids = parsed.data;
  if (ids && ids.length === 0) return { marked: 0 };
  const rows = await withOrg(ctx.container.database, ctx.orgId, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.orgId, ctx.orgId),
          eq(notifications.userId, ctx.userId),
          isNull(notifications.readAt),
          ...(ids ? [inArray(notifications.id, ids)] : []),
        ),
      )
      .returning({ id: notifications.id }),
  );
  return { marked: rows.length };
}
