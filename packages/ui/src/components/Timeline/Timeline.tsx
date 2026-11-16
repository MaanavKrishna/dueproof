import type { Icon } from "@dueproof/icons";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";
import styles from "./Timeline.module.css";

export type TimelineTone = "neutral" | "accent" | "success" | "warning" | "danger" | "proof";

export interface TimelineItem {
  id: string;
  title: ReactNode;
  /** Already formatted: "24 Oct 2026, 11:20 IST". Put the ISO value in `dateTime`. */
  time?: ReactNode;
  dateTime?: string;
  description?: ReactNode;
  icon?: Icon;
  tone?: TimelineTone;
  /** complete: in the past; current: where things stand; upcoming: expected next. */
  status?: "complete" | "current" | "upcoming";
  /** Trailing content: an avatar, a button, a link to the document. */
  meta?: ReactNode;
  /** Extra content under the item (an attachment, a quote). */
  children?: ReactNode;
}

export interface TimelineProps extends Omit<ComponentProps<"ol">, "children"> {
  items: TimelineItem[];
  /** Accessible name, e.g. "Case thread". */
  "aria-label": string;
  density?: "comfortable" | "compact";
}

/**
 * A vertical sequence of events: the documents in a case thread, the stages
 * a notice went through, or activity. Status is spoken, not just drawn.
 */
export function Timeline({ items, density = "comfortable", className, ...rest }: TimelineProps) {
  return (
    <ol className={cx(styles.timeline, styles[density], className)} {...rest}>
      {items.map((item) => {
        const ItemIcon = item.icon;
        const status = item.status ?? "complete";
        return (
          <li
            key={item.id}
            className={cx(styles.item, styles[status], styles[`tone-${item.tone ?? "neutral"}`])}
            aria-current={status === "current" ? "step" : undefined}
          >
            <span className={styles.rail} aria-hidden="true">
              <span className={styles.marker}>
                {ItemIcon ? <ItemIcon size={14} strokeWidth={1.75} /> : null}
              </span>
            </span>
            <div className={styles.content}>
              <div className={styles.head}>
                <span className={styles.title}>
                  {item.title}
                  {status !== "complete" ? (
                    <span className={styles.srOnly}>
                      {status === "current" ? ", current" : ", upcoming"}
                    </span>
                  ) : null}
                </span>
                {item.meta ? <span className={styles.meta}>{item.meta}</span> : null}
              </div>
              {item.time ? (
                item.dateTime ? (
                  <time className={styles.time} dateTime={item.dateTime}>
                    {item.time}
                  </time>
                ) : (
                  <span className={styles.time}>{item.time}</span>
                )
              ) : null}
              {item.description ? <p className={styles.description}>{item.description}</p> : null}
              {item.children ? <div className={styles.extra}>{item.children}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
