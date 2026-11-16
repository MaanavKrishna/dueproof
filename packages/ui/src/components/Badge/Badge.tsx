import type { Icon } from "@dueproof/icons";
import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";
import styles from "./Badge.module.css";

export type Tone = "neutral" | "accent" | "danger" | "warning" | "success" | "info";

export interface BadgeProps extends ComponentProps<"span"> {
  tone?: Tone;
  /** soft: tinted background (default). solid: strong fill, for counts on icons. outline: hairline only. */
  variant?: "soft" | "solid" | "outline";
  size?: "sm" | "md";
  icon?: Icon;
}

/** A short label or count. Not interactive. */
export function Badge({
  tone = "neutral",
  variant = "soft",
  size = "md",
  icon: BadgeIcon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cx(styles.badge, styles[tone], styles[variant], styles[size], className)}
      {...rest}
    >
      {BadgeIcon ? <BadgeIcon size={size === "sm" ? 12 : 14} strokeWidth={2} /> : null}
      {children}
    </span>
  );
}
