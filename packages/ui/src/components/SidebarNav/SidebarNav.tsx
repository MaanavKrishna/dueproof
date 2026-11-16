import { type Icon, SidebarIcon } from "@dueproof/icons";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cx } from "../../utils/cx";
import { type LinkRenderProps, useAppShell } from "../AppShell/AppShell";
import { IconButton } from "../IconButton/IconButton";
import { Tooltip } from "../Tooltip/Tooltip";
import styles from "./SidebarNav.module.css";

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: Icon;
  href?: string;
  /** Open items, shown as a count. */
  count?: number;
  /** "attention" tints the count (overdue, needs review). */
  countTone?: "neutral" | "attention";
  onSelect?: () => void;
  /** Shortcut hint in the tooltip when collapsed, e.g. "G T". */
  shortcut?: string;
}

export interface SidebarNavSection {
  id: string;
  /** Section heading (omit for the first, primary section). */
  title?: string;
  items: SidebarNavItem[];
}

export interface SidebarNavProps extends Omit<ComponentProps<"nav">, "children"> {
  sections: SidebarNavSection[];
  /** The current page's item. */
  activeId?: string | undefined;
  /** The organisation switcher, logo or wordmark at the top. */
  header?: ReactNode;
  /** The signed-in person, help and settings at the bottom. */
  footer?: ReactNode;
  /** Render links with the app's router (e.g. Next.js <Link>). */
  renderLink?: (props: LinkRenderProps) => ReactNode;
  /** Show the collapse button (desktop). Default true. */
  collapsible?: boolean;
  /** Force collapsed (icons only). Defaults to the surrounding AppShell's state. */
  collapsed?: boolean;
  "aria-label"?: string;
}

/**
 * The sidebar: sections of items with icons, counts and the active page.
 * Collapses to icons (with tooltips) inside an AppShell.
 */
export function SidebarNav({
  sections,
  activeId,
  header,
  footer,
  renderLink,
  collapsible = true,
  collapsed: collapsedProp,
  className,
  "aria-label": ariaLabel = "Main",
  ...rest
}: SidebarNavProps) {
  const shell = useAppShell();
  const collapsed = collapsedProp ?? shell.sidebarCollapsed;

  return (
    <nav
      className={cx(styles.nav, collapsed && styles.collapsed, className)}
      aria-label={ariaLabel}
      data-collapsed={collapsed ? "" : undefined}
      {...rest}
    >
      <div className={styles.top}>
        {header ? <div className={styles.header}>{header}</div> : null}
        {collapsible && !shell.isMobile ? (
          <IconButton
            icon={SidebarIcon}
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            size="sm"
            className={styles.toggle}
            aria-expanded={!collapsed}
            onClick={shell.toggleSidebar}
          />
        ) : null}
      </div>
      <div className={styles.scroll}>
        {sections.map((section) => {
          const headingId = section.title ? `dp-nav-${section.id}` : undefined;
          return (
            <div key={section.id} className={styles.section}>
              {section.title ? (
                <h2 id={headingId} className={styles.sectionTitle}>
                  {section.title}
                </h2>
              ) : null}
              <ul className={styles.list} aria-labelledby={headingId}>
                {section.items.map((item) => (
                  <li key={item.id}>
                    <NavLink
                      item={item}
                      active={item.id === activeId}
                      collapsed={collapsed}
                      renderLink={renderLink}
                      onNavigate={shell.closeMobileSidebar}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </nav>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  renderLink,
  onNavigate,
}: {
  item: SidebarNavItem;
  active: boolean;
  collapsed: boolean;
  renderLink: SidebarNavProps["renderLink"];
  onNavigate: () => void;
}) {
  const ItemIcon = item.icon;
  const hasCount = item.count !== undefined && item.count > 0;
  const accessibleName = collapsed && hasCount ? `${item.label}, ${item.count}` : undefined;
  const body = (
    <>
      <ItemIcon size={18} className={styles.icon} />
      <span className={styles.label}>{item.label}</span>
      {hasCount ? (
        <span
          className={cx(styles.count, item.countTone === "attention" && styles.attention)}
          aria-hidden={collapsed || undefined}
        >
          {item.count}
        </span>
      ) : null}
    </>
  );
  const onClick = () => {
    item.onSelect?.();
    onNavigate();
  };
  const current = active ? ("page" as const) : undefined;
  const className = cx(styles.item, active && styles.active);
  const link = item.href ? (
    renderLink ? (
      renderLink({
        href: item.href,
        className,
        children: body,
        "aria-current": current,
        "aria-label": accessibleName,
        onClick,
      })
    ) : (
      <a
        href={item.href}
        className={className}
        aria-current={current}
        aria-label={accessibleName}
        onClick={onClick}
      >
        {body}
      </a>
    )
  ) : (
    <button
      type="button"
      className={className}
      aria-current={current}
      aria-label={accessibleName}
      onClick={onClick}
    >
      {body}
    </button>
  );
  if (!collapsed) return link;
  return (
    <Tooltip
      content={hasCount ? `${item.label} · ${item.count}` : item.label}
      shortcut={item.shortcut}
      side="right"
    >
      {link as ReactElement}
    </Tooltip>
  );
}
