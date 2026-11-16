import {
  CalendarDaysIcon,
  CalendarIcon,
  DoneIcon,
  type Icon,
  OverdueIcon,
  TodayIcon,
} from "@dueproof/icons";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";
import styles from "./DueChip.module.css";

export type DueState = "overdue" | "today" | "week" | "later" | "done";

/** The word and icon for each rung of the due ladder. Colour is never the only signal. */
export const dueLadder: Record<DueState, { label: string; icon: Icon }> = {
  overdue: { label: "Overdue", icon: OverdueIcon },
  today: { label: "Due today", icon: TodayIcon },
  week: { label: "This week", icon: CalendarDaysIcon },
  later: { label: "Later", icon: CalendarIcon },
  done: { label: "Done", icon: DoneIcon },
};

export interface DueChipProps extends Omit<ComponentProps<"span">, "children"> {
  state: DueState;
  /**
   * Detail after the word, already formatted by the caller (dates come from
   * packages/core and are formatted by packages/i18n), e.g. "20 Nov 2026" or "3 days".
   */
  detail?: ReactNode;
  /** Replace the default word (keep it short and plain). */
  label?: string;
  size?: "sm" | "md";
}

/**
 * Where a deadline sits on the due ladder: overdue · today · this week · later · done.
 * Always an icon, a word and a colour together.
 */
export function DueChip({ state, detail, label, size = "md", className, ...rest }: DueChipProps) {
  const rung = dueLadder[state];
  const StateIcon = rung.icon;
  return (
    <span
      className={cx(styles.chip, styles[state], styles[size], className)}
      data-state={state}
      {...rest}
    >
      <StateIcon size={size === "sm" ? 12 : 14} strokeWidth={2} className={styles.icon} />
      <span className={styles.word}>{label ?? rung.label}</span>
      {detail ? (
        <>
          <span className={styles.sep} aria-hidden="true">
            ·
          </span>
          <span className={styles.detail}>{detail}</span>
        </>
      ) : null}
    </span>
  );
}
