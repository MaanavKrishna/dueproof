import { MenuIcon } from "@dueproof/icons";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { cx } from "../../utils/cx";
import { useAppShell } from "../AppShell/AppShell";
import { IconButton } from "../IconButton/IconButton";
import styles from "./Toolbar.module.css";

export interface ToolbarProps {
  /** The screen's title: the page's one <h1>. */
  title: ReactNode;
  /** A line under the large title ("3 overdue, 5 due this week"). */
  subtitle?: ReactNode;
  /** Before the title in the bar: a back button. */
  leading?: ReactNode;
  /** Buttons on the right of the bar. Keep to one primary action. */
  actions?: ReactNode;
  /** Breadcrumbs above the large title. */
  breadcrumbs?: ReactNode;
  /**
   * Apple-style large title that collapses into the bar on scroll. Default true.
   * Set false for dense screens where the bar carries the title from the start.
   */
  largeTitle?: boolean;
  /** Content under the title that scrolls with the page (tabs, a stage bar). */
  children?: ReactNode;
  /** Show a menu button that opens the sidebar on phones. Default true. */
  mobileMenu?: boolean;
  /**
   * A custom header in place of the large title (e.g. a NoticeHeader that
   * carries the page's <h1>). It scrolls under the bar like a large title, and
   * the bar shows `title` once it's gone.
   */
  hero?: ReactNode;
  className?: string;
}

/**
 * The top of a screen: a translucent bar that stays put, and a large title
 * that scrolls under it and reappears, small, in the bar. Place it first
 * inside the scrolling content area.
 */
export function Toolbar({
  title,
  subtitle,
  leading,
  actions,
  breadcrumbs,
  largeTitle = true,
  children,
  mobileMenu = true,
  hero,
  className,
}: ToolbarProps) {
  const shell = useAppShell();
  const barRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLElement>(null);
  const collapsing = largeTitle || hero != null;
  const [collapsed, setCollapsed] = useState(!collapsing);

  useEffect(() => {
    if (!collapsing) {
      setCollapsed(true);
      return;
    }
    const target = titleRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const barHeight = barRef.current?.offsetHeight ?? 0;
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(entry ? !entry.isIntersecting : false),
      { rootMargin: `${-barHeight}px 0% 0% 0%`, threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [collapsing]);

  return (
    <>
      <div
        ref={barRef}
        className={cx(styles.bar, className)}
        data-collapsed={collapsed ? "" : undefined}
      >
        {mobileMenu && shell.isMobile ? (
          <IconButton icon={MenuIcon} label="Open navigation" onClick={shell.toggleSidebar} />
        ) : null}
        {leading ? <div className={styles.leading}>{leading}</div> : null}
        {collapsing ? (
          <div className={styles.inlineTitle} aria-hidden="true">
            {title}
          </div>
        ) : (
          <h1 className={cx(styles.inlineTitle, styles.inlineHeading)}>{title}</h1>
        )}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {hero != null ? (
        <div ref={titleRef as RefObject<HTMLDivElement>} className={styles.large}>
          {breadcrumbs ? <div className={styles.breadcrumbs}>{breadcrumbs}</div> : null}
          {hero}
        </div>
      ) : largeTitle ? (
        <div className={styles.large}>
          {breadcrumbs ? <div className={styles.breadcrumbs}>{breadcrumbs}</div> : null}
          <h1 ref={titleRef as RefObject<HTMLHeadingElement>} className={styles.largeTitle}>
            {title}
          </h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
      ) : subtitle || breadcrumbs ? (
        <div className={styles.compactMeta}>
          {breadcrumbs}
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
      ) : null}
      {children ? <div className={styles.accessory}>{children}</div> : null}
    </>
  );
}
