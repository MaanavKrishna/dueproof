import type { Icon } from "@dueproof/icons";
import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";
import type { Tone } from "../Badge/Badge";
import badgeStyles from "../Badge/Badge.module.css";
import styles from "./StatusPill.module.css";

export interface StatusPillProps extends Omit<ComponentProps<"span">, "children"> {
  /** The status in words, e.g. "In review". Always visible: colour is never the only signal. */
  label: string;
  tone?: Tone;
  /** An icon instead of the dot. */
  icon?: Icon;
  /** Pulse the dot for live, in-progress states (e.g. "Reading"). Off under reduced motion. */
  live?: boolean;
}

/** A workflow status: a dot (or icon) and a word. */
export function StatusPill({
  label,
  tone = "neutral",
  icon: PillIcon,
  live = false,
  className,
  ...rest
}: StatusPillProps) {
  return (
    <span className={cx(badgeStyles[tone], styles.pill, className)} {...rest}>
      {PillIcon ? (
        <PillIcon size={14} strokeWidth={2} className={styles.icon} />
      ) : (
        <span className={cx(styles.dot, live && styles.live)} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
