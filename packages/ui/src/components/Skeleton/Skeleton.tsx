import type { ComponentProps, CSSProperties } from "react";
import { cx } from "../../utils/cx";
import styles from "./Skeleton.module.css";

export interface SkeletonProps extends ComponentProps<"span"> {
  /** text: one line of body text. rect: a block. circle: an avatar. */
  shape?: "text" | "rect" | "circle";
  /** Any CSS length, e.g. "60%" or a token var. */
  width?: string;
  height?: string;
}

/**
 * A placeholder while content loads. Decorative: wrap the loading region in
 * an element with aria-busy="true", and announce completion elsewhere.
 */
export function Skeleton({
  shape = "text",
  width,
  height,
  className,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(styles.skeleton, styles[shape], className)}
      style={
        { ...style, ...(width ? { width } : {}), ...(height ? { height } : {}) } as CSSProperties
      }
      {...rest}
    />
  );
}

export interface SkeletonTextProps extends ComponentProps<"span"> {
  lines?: number;
}

/** Several lines of text; the last one is shorter. */
export function SkeletonText({ lines = 3, className, ...rest }: SkeletonTextProps) {
  return (
    <span aria-hidden="true" className={cx(styles.lines, className)} {...rest}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder lines
          key={i}
          shape="text"
          width={i === lines - 1 && lines > 1 ? "62%" : "100%"}
        />
      ))}
    </span>
  );
}
