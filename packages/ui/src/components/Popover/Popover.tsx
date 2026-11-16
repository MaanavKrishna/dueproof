import { CloseIcon } from "@dueproof/icons";
import { Popover as RadixPopover } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import shared from "../../styles/shared.module.css";
import { cx } from "../../utils/cx";
import styles from "./Popover.module.css";

/** Root: holds open state. Use with PopoverTrigger and PopoverContent. */
export const Popover = RadixPopover.Root;

export function PopoverTrigger(
  props: Omit<ComponentProps<typeof RadixPopover.Trigger>, "asChild">,
) {
  return <RadixPopover.Trigger asChild {...props} />;
}

export const PopoverClose = RadixPopover.Close;
export const PopoverAnchor = RadixPopover.Anchor;

export interface PopoverContentProps
  extends Omit<ComponentProps<typeof RadixPopover.Content>, "title"> {
  /** A heading at the top; also the dialog's accessible name. */
  title?: ReactNode;
  /** Show a close button in the corner. */
  showClose?: boolean;
  width?: "sm" | "md" | "lg";
}

/** Rich, interactive content anchored to a trigger. Escape or an outside click closes it. */
export function PopoverContent({
  title,
  showClose = false,
  width = "md",
  className,
  children,
  sideOffset = 6,
  collisionPadding = 12,
  ...rest
}: PopoverContentProps) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cx(shared.floating, styles.content, styles[width], className)}
        {...rest}
      >
        {title ? <div className={styles.title}>{title}</div> : null}
        {children}
        {showClose ? (
          <RadixPopover.Close className={styles.close} aria-label="Close">
            <CloseIcon size={16} />
          </RadixPopover.Close>
        ) : null}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}
