import { ExternalLinkIcon } from "@dueproof/icons";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cx } from "../../utils/cx";
import styles from "./Link.module.css";

export interface LinkProps extends ComponentProps<"a"> {
  /** Opens in a new tab with an icon and a "(opens in a new tab)" hint for screen readers. */
  external?: boolean;
  /** standard: signature colour. subtle: inherits the text colour, underlined. */
  variant?: "standard" | "subtle";
  /** Render the child element (e.g. a router link) with link styles. */
  asChild?: boolean;
}

export function Link({
  external = false,
  variant = "standard",
  asChild = false,
  className,
  children,
  ...rest
}: LinkProps) {
  const classes = cx(styles.link, styles[variant], className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...rest}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <a
      className={classes}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {children}
      {external ? (
        <>
          <ExternalLinkIcon size="0.9em" className={styles.externalIcon} />
          <span className={styles.hint}>(opens in a new tab)</span>
        </>
      ) : null}
    </a>
  );
}
