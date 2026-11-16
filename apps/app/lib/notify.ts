/**
 * Notifications (01 §4): due soon, overdue, assigned, mentioned and
 * escalated. Each is a row in `notifications` (read in the app after
 * sign-in) and, for people who opted in on a device, a Web Push with a
 * generic line only. `key` makes a notification idempotent: the daily job
 * can run twice without telling anyone twice.
 *
 *   await notify(c, orgId, { userId, kind: "deadline.assigned", key: `assigned:${id}:${userId}`,
 *     payload: { deadlineId: id, title } });
 */
import "server-only";
import { and, type Database, eq, notifications, sql, uuidv7, withOrg } from "@dueproof/db";
import type { Env } from "./env";
import { type PushMessage, sendPushToUser } from "./push";

export type NotificationKind =
  | "deadline.due_soon"
  | "deadline.overdue"
  | "deadline.assigned"
  | "deadline.escalated"
  | "comment.mentioned";

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  /** Dedupe key: one notification per key and person. */
  key: string;
  /** Shown in the app's notification centre (titles, ids; never document text). */
  payload: { title: string; href: string; [k: string]: unknown };
}

/** The generic line that goes over Web Push: no client names, amounts or text (05 §7). */
export const PUSH_LINES: Record<NotificationKind, string> = {
  "deadline.due_soon": "A deadline is coming up",
  "deadline.overdue": "A deadline needs attention",
  "deadline.assigned": "Something was assigned to you",
  "deadline.escalated": "An overdue item needs attention",
  "comment.mentioned": "You were mentioned",
};

/** Insert unless the same key was already sent to this person. Returns whether it was new. */
export async function notify(
  c: { database: Database; env: Env },
  orgId: string,
  input: NotifyInput,
  options: { push?: boolean } = {},
): Promise<boolean> {
  const created = await withOrg(c.database, orgId, async (tx) => {
    const [existing] = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, orgId),
          eq(notifications.userId, input.userId),
          eq(notifications.kind, input.kind),
          sql`${notifications.payload}->>'key' = ${input.key}`,
        ),
      )
      .limit(1);
    if (existing) return false;
    await tx.insert(notifications).values({
      id: uuidv7(),
      orgId,
      userId: input.userId,
      kind: input.kind,
      payload: { ...input.payload, key: input.key },
    });
    return true;
  });
  if (created && options.push !== false) {
    const message: PushMessage = {
      title: PUSH_LINES[input.kind],
      url: input.payload.href,
      tag: input.kind,
    };
    await sendPushToUser(c, orgId, input.userId, message).catch(() => undefined);
  }
  return created;
}

/** For the case thread (S2): tell each mentioned person once per comment. */
export async function notifyMentions(
  c: { database: Database; env: Env },
  orgId: string,
  comment: {
    id: string;
    caseId: string;
    caseTitle: string;
    mentions: string[];
    authorUserId: string;
  },
): Promise<number> {
  let n = 0;
  for (const userId of new Set(comment.mentions)) {
    if (userId === comment.authorUserId) continue;
    const created = await notify(c, orgId, {
      userId,
      kind: "comment.mentioned",
      key: `mention:${comment.id}`,
      payload: { title: `Mentioned on ${comment.caseTitle}`, href: `/notices/${comment.caseId}` },
    });
    if (created) n += 1;
  }
  return n;
}
