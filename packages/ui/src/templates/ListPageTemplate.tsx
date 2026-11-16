import type { ReactNode } from "react";
import { SplitView } from "../components/AppShell/SplitView";
import { Toolbar } from "../components/Toolbar/Toolbar";
import { cx } from "../utils/cx";
import styles from "./templates.module.css";

export interface ListPageTemplateProps {
  /** The screen's title (its <h1>): "Notices", "Deadlines", "Clients". */
  title: ReactNode;
  /** A line under the title: "142 open · 9 overdue". */
  subtitle?: ReactNode;
  breadcrumbs?: ReactNode;
  /** Toolbar buttons: the one primary action ("Upload notice") and secondary ones. */
  actions?: ReactNode;
  /** Before the title in the bar (a back button). */
  toolbarLeading?: ReactNode;
  /** A page-level banner (offline, permission, processing). */
  banner?: ReactNode;
  /** Stat cards or a summary above the list. */
  summary?: ReactNode;
  /** A <FilterBar>, and view switches (list · calendar · timeline). */
  filterBar?: ReactNode;
  /** The list: usually a <DataTable>, or a <Calendar> for another view. It fills the remaining height. */
  children: ReactNode;
  /** A record's details beside the list (opens from a row). */
  inspector?: ReactNode;
  inspectorTitle?: ReactNode;
  inspectorOpen?: boolean;
  onInspectorOpenChange?: (open: boolean) => void;
  inspectorActions?: ReactNode;
  /** Let the list scroll the page instead of filling it (for short lists and calendars). */
  scrollPage?: boolean;
  className?: string;
}

/**
 * A register screen: toolbar with the title and actions, filters and saved
 * views, then a table that fills the height, with an optional inspector.
 * Used by Notices, Deadlines, Clients, Inbox.
 */
export function ListPageTemplate({
  title,
  subtitle,
  breadcrumbs,
  actions,
  toolbarLeading,
  banner,
  summary,
  filterBar,
  children,
  inspector,
  inspectorTitle,
  inspectorOpen,
  onInspectorOpenChange,
  inspectorActions,
  scrollPage = false,
  className,
}: ListPageTemplateProps) {
  return (
    <SplitView
      className={cx(styles.page, className)}
      inspector={inspector}
      inspectorTitle={inspectorTitle}
      {...(inspectorOpen !== undefined ? { inspectorOpen } : {})}
      {...(onInspectorOpenChange ? { onInspectorOpenChange } : {})}
      inspectorActions={inspectorActions}
    >
      <div className={cx(styles.list, scrollPage && styles.listScroll)}>
        <Toolbar
          title={title}
          subtitle={subtitle}
          breadcrumbs={breadcrumbs}
          actions={actions}
          leading={toolbarLeading}
        />
        {banner ? <div className={styles.banner}>{banner}</div> : null}
        {summary ? <div className={styles.summary}>{summary}</div> : null}
        {filterBar ? <div className={styles.filters}>{filterBar}</div> : null}
        <div className={styles.listBody}>{children}</div>
      </div>
    </SplitView>
  );
}
