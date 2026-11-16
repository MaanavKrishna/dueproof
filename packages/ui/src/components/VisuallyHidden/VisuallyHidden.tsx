import type { ComponentProps } from "react";
import shared from "../../styles/shared.module.css";
import { cx } from "../../utils/cx";

/** Content for screen readers only. */
export function VisuallyHidden({ className, ...rest }: ComponentProps<"span">) {
  return <span className={cx(shared.visuallyHidden, className)} {...rest} />;
}
