import { BellIcon, CheckIcon, type Icon } from "@dueproof/icons";
import { type ReactNode, useState } from "react";
import { cx } from "../../utils/cx";
import { useControllableState } from "../../utils/use-controllable";
import { Button } from "../Button/Button";
import { EmptyState } from "../EmptyState/EmptyState";
import { Popover, PopoverContent, PopoverTrigger } from "../Popover/Popover";
import { SegmentedControl } from "../SegmentedControl/SegmentedControl";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./NotificationCenter.module.css";

export interface NotificationItem {
  id: string;
  title: string;
  body?: string;
  /** Already formatted: "10 min ago", "Yesterday". */
  time: string;
  dateTime?: string;
  read?: boolean;
  icon?: Icon;
  tone?: "neutral" | "attention" | "success" | "accent";
  onSelect?: () => void;
}

export interface NotificationCenterProps {
  notifications: NotificationItem[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onMarkAllRead?: () => void;
  /** Footer link: "Notification settings". */
  footer?: ReactNode;
}

/** The bell: a popover list of what happened, newest first, with unread counts. */
export function NotificationCenter({
  notifications,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  onMarkAllRead,
  footer,
}: NotificationCenterProps) {
  const [open, setOpen] = useControllableState(openProp, defaultOpen, onOpenChange);
  const [filter, setFilter] = useState("all");
  const unread = notifications.filter((n) => !n.read).length;
  const shown = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;
  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content="Notifications">
        <PopoverTrigger>
          <button type="button" className={styles.bell} aria-label={label}>
            <BellIcon size={18} />
            {unread ? (
              <span className={styles.badge} aria-hidden="true">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent width="lg" align="end" className={styles.panel} aria-label="Notifications">
        <header className={styles.header}>
          <h2 className={styles.title}>Notifications</h2>
          {onMarkAllRead && unread ? (
            <Button size="sm" variant="plain" icon={CheckIcon} onClick={onMarkAllRead}>
              Mark all read
            </Button>
          ) : null}
        </header>
        <SegmentedControl
          aria-label="Show"
          size="sm"
          segments={[
            { value: "all", label: "All" },
            { value: "unread", label: unread ? `Unread (${unread})` : "Unread" },
          ]}
          value={filter}
          onValueChange={setFilter}
        />
        {shown.length === 0 ? (
          <EmptyState
            size="compact"
            headingLevel={3}
            icon={BellIcon}
            title={filter === "unread" ? "You're all caught up" : "No notifications yet"}
            description="Assignments, approvals and escalations show up here."
          />
        ) : (
          <ul className={styles.list}>
            {shown.map((n) => {
              const NIcon = n.icon ?? BellIcon;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cx(styles.item, !n.read && styles.unread)}
                    onClick={() => {
                      n.onSelect?.();
                      setOpen(false);
                    }}
                  >
                    <span className={cx(styles.icon, styles[`tone-${n.tone ?? "neutral"}`])}>
                      <NIcon size={16} />
                    </span>
                    <span className={styles.text}>
                      <span className={styles.itemTitle}>
                        {!n.read ? <span className={styles.srOnly}>Unread: </span> : null}
                        {n.title}
                      </span>
                      {n.body ? <span className={styles.body}>{n.body}</span> : null}
                      {n.dateTime ? (
                        <time className={styles.time} dateTime={n.dateTime}>
                          {n.time}
                        </time>
                      ) : (
                        <span className={styles.time}>{n.time}</span>
                      )}
                    </span>
                    {!n.read ? <span className={styles.dot} aria-hidden="true" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </PopoverContent>
    </Popover>
  );
}
