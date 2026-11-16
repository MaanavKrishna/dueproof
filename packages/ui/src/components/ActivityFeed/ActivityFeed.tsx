import {
  AiSuggestedIcon,
  CommentIcon,
  HistoryIcon,
  type Icon,
  ShieldCheckIcon,
} from "@dueproof/icons";
import { type ComponentProps, type ReactNode, useState } from "react";
import { cx } from "../../utils/cx";
import { Avatar } from "../Avatar/Avatar";
import { SegmentedControl } from "../SegmentedControl/SegmentedControl";
import styles from "./ActivityFeed.module.css";

export type ActivityKind = "comment" | "history" | "audit" | "ai";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  /** Who did it ("Dueproof" for system events). */
  actor: { name: string; avatarUrl?: string };
  /** ISO instant, for ordering and <time>. */
  at: string;
  /** Formatted for display: "24 Oct, 11:20" or "2 h ago". */
  time: string;
  /** For history and audit: "changed the due date". For comments: omit. */
  action?: ReactNode;
  /** The change: from → to, e.g. dates. The old value is struck through. */
  change?: { from?: ReactNode; to: ReactNode };
  /** A comment's text (mentions already rendered) or an event's detail. */
  body?: ReactNode;
  /** A reason given (stage moved back, date corrected). */
  reason?: ReactNode;
}

export interface ActivityFeedProps extends Omit<ComponentProps<"section">, "title"> {
  items: ActivityItem[];
  /** Oldest first (a conversation) or newest first (a log). Default oldest first. */
  order?: "oldest" | "newest";
  /** The comment composer, under the list. */
  composer?: ReactNode;
  /** Show the All / Comments / History filter. Default true. */
  filter?: boolean;
  title?: ReactNode;
}

const kindInfo: Record<ActivityKind, { icon: Icon; word: string }> = {
  comment: { icon: CommentIcon, word: "Comment" },
  history: { icon: HistoryIcon, word: "Change" },
  audit: { icon: ShieldCheckIcon, word: "Audit" },
  ai: { icon: AiSuggestedIcon, word: "AI" },
};

/** Comments, history and the audit trail of a case, merged in time order. */
export function ActivityFeed({
  items,
  order = "oldest",
  composer,
  filter = true,
  title = "Activity",
  className,
  ...rest
}: ActivityFeedProps) {
  const [show, setShow] = useState("all");
  const filtered = items
    .filter((i) =>
      show === "all" ? true : show === "comments" ? i.kind === "comment" : i.kind !== "comment",
    )
    .sort((a, b) => (order === "oldest" ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at)));
  const comments = items.filter((i) => i.kind === "comment").length;
  return (
    <section className={cx(styles.feed, className)} aria-label="Activity" {...rest}>
      <header className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {filter ? (
          <SegmentedControl
            aria-label="Show"
            size="sm"
            value={show}
            onValueChange={setShow}
            segments={[
              { value: "all", label: "All" },
              { value: "comments", label: `Comments${comments ? ` (${comments})` : ""}` },
              { value: "history", label: "History" },
            ]}
          />
        ) : null}
      </header>
      {filtered.length === 0 ? (
        <p className={styles.empty}>
          {show === "comments" ? "No comments yet. Start the conversation below." : "Nothing yet."}
        </p>
      ) : (
        <ol className={styles.list}>
          {filtered.map((item) => {
            const info = kindInfo[item.kind];
            const KIcon = info.icon;
            const isComment = item.kind === "comment";
            return (
              <li
                key={item.id}
                className={cx(styles.item, isComment ? styles.comment : styles.event)}
              >
                <span className={styles.lead}>
                  {isComment ? (
                    <Avatar name={item.actor.name} src={item.actor.avatarUrl} size="sm" />
                  ) : (
                    <span className={cx(styles.eventIcon, styles[`kind-${item.kind}`])}>
                      <KIcon size={14} />
                    </span>
                  )}
                </span>
                <div className={styles.content}>
                  <p className={styles.line}>
                    <span className={styles.srOnly}>{info.word}: </span>
                    <strong className={styles.actor}>{item.actor.name}</strong>{" "}
                    {item.action ? <span className={styles.action}>{item.action}</span> : null}
                    {item.change ? (
                      <span className={styles.change}>
                        {item.change.from !== undefined ? (
                          <>
                            <del className={styles.from}>
                              <span className={styles.srOnly}>from </span>
                              {item.change.from}
                            </del>
                            <span aria-hidden="true"> → </span>
                          </>
                        ) : null}
                        <ins className={styles.to}>
                          <span className={styles.srOnly}>to </span>
                          {item.change.to}
                        </ins>
                      </span>
                    ) : null}
                    <time className={styles.time} dateTime={item.at}>
                      {item.time}
                    </time>
                  </p>
                  {item.body ? (
                    <div className={isComment ? styles.bubble : styles.detail}>{item.body}</div>
                  ) : null}
                  {item.reason ? (
                    <p className={styles.reason}>
                      <span className={styles.reasonLabel}>Reason:</span> {item.reason}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {composer ? <div className={styles.composer}>{composer}</div> : null}
    </section>
  );
}
