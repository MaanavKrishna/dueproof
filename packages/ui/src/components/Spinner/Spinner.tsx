import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";
import styles from "./Spinner.module.css";

export interface SpinnerProps extends Omit<ComponentProps<"span">, "children"> {
  size?: "sm" | "md" | "lg";
  /** Announced to screen readers. Pass `null` when a parent already announces busy state. */
  label?: string | null;
}

/** An indeterminate activity indicator. Use Progress when the amount of work is known. */
export function Spinner({ size = "md", label = "Loading", className, ...rest }: SpinnerProps) {
  return (
    <span
      role={label ? "status" : undefined}
      className={cx(styles.spinner, styles[size], className)}
      {...rest}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.svg}>
        <circle cx="12" cy="12" r="9" className={styles.track} />
        <path d="M21 12a9 9 0 0 0-9-9" className={styles.arc} />
      </svg>
      {label ? <span className={styles.label}>{label}</span> : null}
    </span>
  );
}
