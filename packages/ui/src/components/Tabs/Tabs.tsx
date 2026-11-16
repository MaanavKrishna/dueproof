import { Tabs as RadixTabs } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "../../utils/cx";
import styles from "./Tabs.module.css";

export type TabsProps = ComponentProps<typeof RadixTabs.Root>;

/** Tabs switch between sibling panels of content. ←/→ move between tabs. */
export function Tabs({ className, ...rest }: TabsProps) {
  return <RadixTabs.Root className={cx(styles.root, className)} {...rest} />;
}

export interface TabListProps extends ComponentProps<typeof RadixTabs.List> {
  /** Accessible name for the tab list. */
  "aria-label": string;
}

export function TabList({ className, ...rest }: TabListProps) {
  return <RadixTabs.List className={cx(styles.list, className)} {...rest} />;
}

export interface TabProps extends ComponentProps<typeof RadixTabs.Trigger> {
  /** A count shown after the label (e.g. open items). */
  count?: number;
  children: ReactNode;
}

export function Tab({ className, count, children, ...rest }: TabProps) {
  return (
    <RadixTabs.Trigger className={cx(styles.tab, className)} {...rest}>
      <span
        className={styles.tabLabel}
        data-text={typeof children === "string" ? children : undefined}
      >
        {children}
      </span>
      {count !== undefined ? <span className={styles.count}>{count}</span> : null}
    </RadixTabs.Trigger>
  );
}

export function TabPanel({ className, ...rest }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cx(styles.panel, className)} {...rest} />;
}
