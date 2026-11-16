import type { Icon } from "@dueproof/icons";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps extends Omit<ComponentProps<"section">, "title"> {
  icon?: Icon;
  /** Plain and specific: "No notices yet", "Nothing due this week". */
  title: ReactNode;
  /** What to do next, in a sentence. */
  description?: ReactNode;
  /** One primary action, optionally a secondary one. */
  actions?: ReactNode;
  /** hero: editorial type for first-run screens. standard: in-page. compact: inside a card or table. */
  size?: "compact" | "standard" | "hero";
  /** Heading level for the title (keep the outline correct). */
  headingLevel?: 2 | 3 | 4;
}

/** What a screen shows when there's nothing to show, and what to do about it. */
export function EmptyState({
  icon: StateIcon,
  title,
  description,
  actions,
  size = "standard",
  headingLevel = 2,
  className,
  ...rest
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className={cx(styles.empty, styles[size], className)} {...rest}>
      {StateIcon ? (
        <span className={styles.art} aria-hidden="true">
          <StateIcon size={size === "hero" ? 32 : size === "compact" ? 20 : 24} />
        </span>
      ) : null}
      <Heading className={styles.title}>{title}</Heading>
      {description ? <p className={styles.description}>{description}</p> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}
