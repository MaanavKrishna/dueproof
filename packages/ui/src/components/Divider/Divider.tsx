import { Separator } from "radix-ui";
import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";
import styles from "./Divider.module.css";

export interface DividerProps extends ComponentProps<typeof Separator.Root> {
  /** Indent from the leading edge, as in inset grouped lists. */
  inset?: boolean;
  /** Spacing around the line. */
  spacing?: "none" | "sm" | "md" | "lg";
}

/** A hairline between groups of content. Decorative unless `decorative={false}`. */
export function Divider({
  inset = false,
  spacing = "none",
  orientation = "horizontal",
  decorative = true,
  className,
  ...rest
}: DividerProps) {
  return (
    <Separator.Root
      orientation={orientation}
      decorative={decorative}
      className={cx(
        styles.divider,
        styles[orientation],
        inset && styles.inset,
        styles[`space-${spacing}`],
        className,
      )}
      {...rest}
    />
  );
}
