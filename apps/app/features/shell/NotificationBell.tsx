"use client";
/**
 * The sidebar bell, wired to the person's in-app notifications: loaded on
 * mount, every minute, and whenever the panel opens. Choosing one opens its
 * page and marks it read; "Mark all read" clears the rest.
 */
import { NotificationCenter, type NotificationItem } from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { listNotifications, markNotificationsRead } from "@/app/actions/notifications";
import type { InboxNotification } from "@/lib/notifications";

/** How often the bell looks for new notifications, ms. */
export const BELL_POLL_MS = 60_000;

const TONES: Record<string, NotificationItem["tone"]> = {
  "deadline.overdue": "attention",
  "deadline.escalated": "attention",
  "deadline.due_soon": "accent",
  "deadline.assigned": "neutral",
  "comment.mentioned": "neutral",
};

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });

/** "Just now", "12 min ago", "3 h ago", "Yesterday", "4 Nov". */
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.floor((now - Date.parse(iso)) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "Yesterday";
  return dateFmt.format(new Date(iso));
}

export function NotificationBell({ footer }: { footer?: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<InboxNotification[]>([]);

  const load = useCallback(async () => {
    const res = await listNotifications().catch(() => null);
    if (res?.ok) setItems(res.data);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), BELL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const markRead = async (ids: string[] | null) => {
    setItems((cur) =>
      cur.map((n) => (ids === null || ids.includes(n.id) ? { ...n, read: true } : n)),
    );
    await markNotificationsRead(ids).catch(() => null);
  };

  const notifications: NotificationItem[] = items.map((n) => ({
    id: n.id,
    title: n.title,
    time: timeAgo(n.createdAt),
    dateTime: n.createdAt,
    read: n.read,
    tone: TONES[n.kind] ?? "neutral",
    onSelect: () => {
      if (!n.read) void markRead([n.id]);
      router.push(n.href);
    },
  }));

  return (
    <NotificationCenter
      notifications={notifications}
      onOpenChange={(open) => {
        if (open) void load();
      }}
      onMarkAllRead={() => void markRead(null)}
      footer={footer}
    />
  );
}
