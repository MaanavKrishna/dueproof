import type { ReactNode } from "react";
import { SplitView } from "../components/AppShell/SplitView";
import { Tab, TabList, TabPanel, Tabs } from "../components/Tabs/Tabs";
import { Toolbar } from "../components/Toolbar/Toolbar";
import { cx } from "../utils/cx";
import { useControllableState } from "../utils/use-controllable";
import type { PageWidth } from "./page";
import styles from "./templates.module.css";

export interface DetailTab {
  id: string;
  label: string;
  count?: number;
  content: ReactNode;
}

export interface DetailPageTemplateProps {
  /** Short title for the bar once the header scrolls away: the reference. */
  title: ReactNode;
  breadcrumbs?: ReactNode;
  /** Toolbar actions: assign, move stage, approve, print… */
  actions?: ReactNode;
  /** A back button. */
  toolbarLeading?: ReactNode;
  /** The record's header, carrying the page's <h1> (a NoticeHeader or ClientHeader). */
  header: ReactNode;
  /** Under the header: the case stage bar. */
  stageBar?: ReactNode;
  banner?: ReactNode;
  /** Sections as tabs (What must happen · Thread · Demand · Activity). */
  tabs?: DetailTab[];
  activeTab?: string;
  defaultTab?: string;
  onTabChange?: (id: string) => void;
  /** Content without tabs, or under them. */
  children?: ReactNode;
  /** Right-hand inspector: the proof viewer on a case page. */
  inspector?: ReactNode;
  inspectorTitle?: ReactNode;
  inspectorOpen?: boolean;
  onInspectorOpenChange?: (open: boolean) => void;
  inspectorActions?: ReactNode;
  /** Wider inspector for documents. Default "lg". */
  inspectorSize?: "md" | "lg";
  /** How wide the content may go (see PageWidth). Default "wide". */
  width?: PageWidth;
  className?: string;
}

/**
 * A record page (the case page, a client): header, stage bar, sections as
 * tabs, and a right inspector, e.g. the proof viewer.
 */
export function DetailPageTemplate({
  title,
  breadcrumbs,
  actions,
  toolbarLeading,
  header,
  stageBar,
  banner,
  tabs,
  activeTab,
  defaultTab,
  onTabChange,
  children,
  inspector,
  inspectorTitle,
  inspectorOpen,
  onInspectorOpenChange,
  inspectorActions,
  inspectorSize = "lg",
  width = "wide",
  className,
}: DetailPageTemplateProps) {
  const [tab, setTab] = useControllableState(
    activeTab,
    defaultTab ?? tabs?.[0]?.id ?? "",
    onTabChange,
  );
  return (
    <SplitView
      className={cx(styles.page, className)}
      inspector={inspector}
      inspectorTitle={inspectorTitle}
      {...(inspectorOpen !== undefined ? { inspectorOpen } : {})}
      {...(onInspectorOpenChange ? { onInspectorOpenChange } : {})}
      inspectorActions={inspectorActions}
      inspectorSize={inspectorSize}
    >
      <div className={cx(styles.column, styles.detail)} data-width={width}>
        <Toolbar
          title={title}
          breadcrumbs={breadcrumbs}
          actions={actions}
          leading={toolbarLeading}
          hero={header}
        />
        {banner ? <div className={styles.banner}>{banner}</div> : null}
        {stageBar ? <div className={styles.stageBar}>{stageBar}</div> : null}
        <div className={styles.detailBody}>
          {tabs && tabs.length > 0 ? (
            <Tabs value={tab} onValueChange={setTab}>
              <TabList aria-label="Sections" className={styles.tabList}>
                {tabs.map((t) => (
                  <Tab
                    key={t.id}
                    value={t.id}
                    {...(t.count !== undefined ? { count: t.count } : {})}
                  >
                    {t.label}
                  </Tab>
                ))}
              </TabList>
              {tabs.map((t) => (
                <TabPanel key={t.id} value={t.id} className={styles.tabPanel}>
                  {t.content}
                </TabPanel>
              ))}
            </Tabs>
          ) : null}
          {children}
        </div>
      </div>
    </SplitView>
  );
}
