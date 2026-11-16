import { CheckIcon, ChevronRightIcon, type Icon } from "@dueproof/icons";
import { ContextMenu as RadixContextMenu } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import shared from "../../styles/shared.module.css";
import { cx } from "../../utils/cx";
import styles from "../Menu/Menu.module.css";

/**
 * Right-click (or long-press, or Shift F10 / the Menu key) menu for a region,
 * e.g. a table row or a highlight. Every item must also be reachable another
 * way: context menus are a shortcut, never the only path.
 */
export const ContextMenu = RadixContextMenu.Root;

/** Wraps the element that opens the menu. */
export function ContextMenuTrigger(
  props: Omit<ComponentProps<typeof RadixContextMenu.Trigger>, "asChild">,
) {
  return <RadixContextMenu.Trigger asChild {...props} />;
}

export function ContextMenuContent({
  className,
  collisionPadding = 8,
  ...rest
}: ComponentProps<typeof RadixContextMenu.Content>) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.Content
        collisionPadding={collisionPadding}
        className={cx(shared.floating, styles.content, className)}
        {...rest}
      />
    </RadixContextMenu.Portal>
  );
}

export interface ContextMenuItemProps extends ComponentProps<typeof RadixContextMenu.Item> {
  icon?: Icon | undefined;
  shortcut?: string | undefined;
  description?: ReactNode;
  destructive?: boolean;
}

export function ContextMenuItem({
  icon: ItemIcon,
  shortcut,
  description,
  destructive = false,
  className,
  children,
  ...rest
}: ContextMenuItemProps) {
  return (
    <RadixContextMenu.Item
      className={cx(shared.item, styles.item, destructive && styles.destructive, className)}
      {...rest}
    >
      <span className={styles.icon}>{ItemIcon ? <ItemIcon size={16} /> : null}</span>
      <span className={styles.text}>
        <span>{children}</span>
        {description ? <span className={styles.description}>{description}</span> : null}
      </span>
      {shortcut ? <span className={styles.shortcut}>{shortcut}</span> : null}
    </RadixContextMenu.Item>
  );
}

export function ContextMenuCheckboxItem({
  className,
  children,
  ...rest
}: ComponentProps<typeof RadixContextMenu.CheckboxItem>) {
  return (
    <RadixContextMenu.CheckboxItem className={cx(shared.item, styles.item, className)} {...rest}>
      <span className={styles.icon}>
        <RadixContextMenu.ItemIndicator>
          <CheckIcon size={16} strokeWidth={2} />
        </RadixContextMenu.ItemIndicator>
      </span>
      <span className={styles.text}>{children}</span>
    </RadixContextMenu.CheckboxItem>
  );
}

export function ContextMenuLabel({
  className,
  ...rest
}: ComponentProps<typeof RadixContextMenu.Label>) {
  return <RadixContextMenu.Label className={cx(styles.label, className)} {...rest} />;
}

export function ContextMenuSeparator({
  className,
  ...rest
}: ComponentProps<typeof RadixContextMenu.Separator>) {
  return <RadixContextMenu.Separator className={cx(styles.separator, className)} {...rest} />;
}

export const ContextMenuGroup = RadixContextMenu.Group;
export const ContextMenuSub = RadixContextMenu.Sub;

export function ContextMenuSubTrigger({
  icon: ItemIcon,
  className,
  children,
  ...rest
}: ComponentProps<typeof RadixContextMenu.SubTrigger> & { icon?: Icon }) {
  return (
    <RadixContextMenu.SubTrigger className={cx(shared.item, styles.item, className)} {...rest}>
      <span className={styles.icon}>{ItemIcon ? <ItemIcon size={16} /> : null}</span>
      <span className={styles.text}>{children}</span>
      <ChevronRightIcon size={16} className={styles.chevron} />
    </RadixContextMenu.SubTrigger>
  );
}

export function ContextMenuSubContent({
  className,
  ...rest
}: ComponentProps<typeof RadixContextMenu.SubContent>) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.SubContent
        collisionPadding={8}
        className={cx(shared.floating, styles.content, className)}
        {...rest}
      />
    </RadixContextMenu.Portal>
  );
}
