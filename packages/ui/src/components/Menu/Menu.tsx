import { CheckIcon, ChevronRightIcon, type Icon } from "@dueproof/icons";
import { DropdownMenu as RadixMenu } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import shared from "../../styles/shared.module.css";
import { cx } from "../../utils/cx";
import styles from "./Menu.module.css";

/** Root: holds open state. Use with MenuTrigger and MenuContent. */
export const Menu = RadixMenu.Root;

/** Wraps a Button or IconButton, which opens the menu (Enter, Space, ↓, or click). */
export function MenuTrigger(props: Omit<ComponentProps<typeof RadixMenu.Trigger>, "asChild">) {
  return <RadixMenu.Trigger asChild {...props} />;
}

export function MenuContent({
  className,
  sideOffset = 6,
  collisionPadding = 8,
  align = "start",
  ...rest
}: ComponentProps<typeof RadixMenu.Content>) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        align={align}
        className={cx(shared.floating, styles.content, className)}
        {...rest}
      />
    </RadixMenu.Portal>
  );
}

interface ItemExtras {
  icon?: Icon | undefined;
  /** Shortcut hint, e.g. "⌘D". Display only. */
  shortcut?: string | undefined;
  description?: ReactNode;
}

export interface MenuItemProps extends ComponentProps<typeof RadixMenu.Item>, ItemExtras {
  /** For destructive actions (shown in the danger colour). */
  destructive?: boolean;
}

function ItemBody({
  icon: ItemIcon,
  shortcut,
  description,
  children,
}: ItemExtras & { children: ReactNode }) {
  return (
    <>
      <span className={styles.icon}>{ItemIcon ? <ItemIcon size={16} /> : null}</span>
      <span className={styles.text}>
        <span>{children}</span>
        {description ? <span className={styles.description}>{description}</span> : null}
      </span>
      {shortcut ? <span className={styles.shortcut}>{shortcut}</span> : null}
    </>
  );
}

export function MenuItem({
  icon,
  shortcut,
  description,
  destructive = false,
  className,
  children,
  ...rest
}: MenuItemProps) {
  return (
    <RadixMenu.Item
      className={cx(shared.item, styles.item, destructive && styles.destructive, className)}
      {...rest}
    >
      <ItemBody icon={icon} shortcut={shortcut} description={description}>
        {children}
      </ItemBody>
    </RadixMenu.Item>
  );
}

export interface MenuCheckboxItemProps extends ComponentProps<typeof RadixMenu.CheckboxItem> {
  shortcut?: string;
}

export function MenuCheckboxItem({
  className,
  children,
  shortcut,
  ...rest
}: MenuCheckboxItemProps) {
  return (
    <RadixMenu.CheckboxItem className={cx(shared.item, styles.item, className)} {...rest}>
      <span className={styles.icon}>
        <RadixMenu.ItemIndicator>
          <CheckIcon size={16} strokeWidth={2} />
        </RadixMenu.ItemIndicator>
      </span>
      <span className={styles.text}>{children}</span>
      {shortcut ? <span className={styles.shortcut}>{shortcut}</span> : null}
    </RadixMenu.CheckboxItem>
  );
}

export const MenuRadioGroup = RadixMenu.RadioGroup;

export function MenuRadioItem({
  className,
  children,
  ...rest
}: ComponentProps<typeof RadixMenu.RadioItem>) {
  return (
    <RadixMenu.RadioItem className={cx(shared.item, styles.item, className)} {...rest}>
      <span className={styles.icon}>
        <RadixMenu.ItemIndicator>
          <CheckIcon size={16} strokeWidth={2} />
        </RadixMenu.ItemIndicator>
      </span>
      <span className={styles.text}>{children}</span>
    </RadixMenu.RadioItem>
  );
}

export function MenuLabel({ className, ...rest }: ComponentProps<typeof RadixMenu.Label>) {
  return <RadixMenu.Label className={cx(styles.label, className)} {...rest} />;
}

export function MenuSeparator({ className, ...rest }: ComponentProps<typeof RadixMenu.Separator>) {
  return <RadixMenu.Separator className={cx(styles.separator, className)} {...rest} />;
}

export const MenuGroup = RadixMenu.Group;
export const MenuSub = RadixMenu.Sub;

export function MenuSubTrigger({
  icon,
  className,
  children,
  ...rest
}: ComponentProps<typeof RadixMenu.SubTrigger> & { icon?: Icon }) {
  return (
    <RadixMenu.SubTrigger className={cx(shared.item, styles.item, className)} {...rest}>
      <ItemBody icon={icon}>{children}</ItemBody>
      <ChevronRightIcon size={16} className={styles.chevron} />
    </RadixMenu.SubTrigger>
  );
}

export function MenuSubContent({
  className,
  ...rest
}: ComponentProps<typeof RadixMenu.SubContent>) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.SubContent
        sideOffset={4}
        collisionPadding={8}
        className={cx(shared.floating, styles.content, className)}
        {...rest}
      />
    </RadixMenu.Portal>
  );
}
