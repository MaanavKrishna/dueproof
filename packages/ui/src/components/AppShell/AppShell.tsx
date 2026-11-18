import type { Icon } from "@dueproof/icons";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { cx } from "../../utils/cx";
import { useMediaQuery } from "../../utils/dom";
import { useControllableState } from "../../utils/use-controllable";
import styles from "./AppShell.module.css";
import { SplitView, type SplitViewProps } from "./SplitView";

interface AppShellContextValue {
  /** Sidebar shows icons only (desktop). */
  sidebarCollapsed: boolean;
  /** Phone layout: the sidebar is a drawer and the bottom tab bar shows. */
  isMobile: boolean;
  /** Collapse/expand on desktop; open/close the drawer on phones. */
  toggleSidebar: () => void;
  /** Close the phone drawer (after navigating). */
  closeMobileSidebar: () => void;
  /** True inside an AppShell, whose <main> already holds the page (L11). */
  inShell: boolean;
}

const AppShellContext = createContext<AppShellContextValue>({
  sidebarCollapsed: false,
  isMobile: false,
  toggleSidebar: () => {},
  closeMobileSidebar: () => {},
  inShell: false,
});

/** The surrounding shell's sidebar state, for toggles in toolbars and the nav itself. */
export function useAppShell(): AppShellContextValue {
  return useContext(AppShellContext);
}

export interface MobileNavItem {
  id: string;
  label: string;
  icon: Icon;
  href?: string;
  /** A count badge (e.g. items in the inbox). */
  count?: number;
  onSelect?: () => void;
}

export interface AppShellProps extends Omit<ComponentProps<"div">, "children"> {
  /** The sidebar's content, usually a <SidebarNav>. */
  sidebar: ReactNode;
  /** The page. Usually a page template (List, Detail, Settings, Wizard). */
  children: ReactNode;
  /** An app-wide banner above everything (offline, trial ending). */
  banner?: ReactNode;
  /** An app-level inspector beside the page (pages usually bring their own via templates). */
  inspector?: ReactNode;
  inspectorOpen?: boolean;
  onInspectorOpenChange?: (open: boolean) => void;
  inspectorTitle?: SplitViewProps["inspectorTitle"];
  sidebarCollapsed?: boolean;
  defaultSidebarCollapsed?: boolean;
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
  /** Bottom tab bar on phones: Today, Deadlines, Capture, Inbox, More (02 §9). */
  mobileNav?: MobileNavItem[];
  mobileNavActiveId?: string;
  /** Render links in the bottom tab bar with the app's router. */
  renderLink?: (props: LinkRenderProps) => ReactNode;
  /** Id of the <main> element, the skip link's target. */
  mainId?: string;
}

export interface LinkRenderProps {
  href: string;
  className: string;
  children: ReactNode;
  "aria-current"?: "page" | undefined;
  "aria-label"?: string | undefined;
  onClick?: () => void;
}

/**
 * The app frame: translucent sidebar, the page, and an optional inspector.
 * The sidebar collapses to icons on desktop and becomes a drawer on phones,
 * where a bottom tab bar takes over navigation.
 */
export function AppShell({
  sidebar,
  children,
  banner,
  inspector,
  inspectorOpen,
  onInspectorOpenChange,
  inspectorTitle,
  sidebarCollapsed: collapsedProp,
  defaultSidebarCollapsed = false,
  onSidebarCollapsedChange,
  mobileNav,
  mobileNavActiveId,
  renderLink,
  mainId = "dp-main",
  className,
  ...rest
}: AppShellProps) {
  const [collapsed, setCollapsed] = useControllableState(
    collapsedProp,
    defaultSidebarCollapsed,
    onSidebarCollapsedChange,
  );
  const isMobile = useMediaQuery("(width < 40rem)");
  // Narrow (a tablet, 200% zoom) or short screens: the sidebar folds to its
  // icon rail, the shell's own collapsed state, so the content keeps the
  // room (M12). The person's saved choice is untouched; the toggle still
  // opens it for now.
  const cramped = useMediaQuery("(width < 60rem), (height < 32rem)");
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);
  useEffect(() => {
    setAutoCollapsed(cramped && !isMobile);
  }, [cramped, isMobile]);

  const shownCollapsed = collapsed || autoCollapsed;
  const toggleSidebar = useCallback(() => {
    if (isMobile) setDrawerOpen((o) => !o);
    else if (autoCollapsed) setAutoCollapsed(false);
    else setCollapsed(!collapsed);
  }, [isMobile, autoCollapsed, collapsed, setCollapsed]);
  const closeMobileSidebar = useCallback(() => setDrawerOpen(false), []);

  const ctx = useMemo(
    () => ({
      sidebarCollapsed: !isMobile && shownCollapsed,
      isMobile,
      toggleSidebar,
      closeMobileSidebar,
      inShell: true,
    }),
    [isMobile, shownCollapsed, toggleSidebar, closeMobileSidebar],
  );

  return (
    <AppShellContext.Provider value={ctx}>
      <div
        className={cx(styles.shell, className)}
        data-sidebar={shownCollapsed ? "collapsed" : "expanded"}
        data-drawer={drawerOpen ? "open" : "closed"}
        data-mobile-nav={mobileNav ? "" : undefined}
        {...rest}
      >
        <a className={styles.skip} href={`#${mainId}`}>
          Skip to content
        </a>
        {banner ? <div className={styles.banner}>{banner}</div> : null}
        <div className={styles.frame}>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: Escape closes the phone drawer. */}
          <div
            className={styles.sidebar}
            onKeyDown={(e) => {
              if (e.key === "Escape" && drawerOpen) setDrawerOpen(false);
            }}
            inert={isMobile && !drawerOpen ? true : undefined}
          >
            {sidebar}
          </div>
          {drawerOpen ? (
            <button
              type="button"
              className={styles.scrim}
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
            />
          ) : null}
          <main id={mainId} className={styles.main} tabIndex={-1}>
            {inspector ? (
              <SplitView
                inspector={inspector}
                {...(inspectorOpen !== undefined ? { inspectorOpen } : {})}
                {...(onInspectorOpenChange ? { onInspectorOpenChange } : {})}
                inspectorTitle={inspectorTitle}
              >
                {children}
              </SplitView>
            ) : (
              children
            )}
          </main>
        </div>
        {mobileNav ? (
          <MobileNav items={mobileNav} activeId={mobileNavActiveId} renderLink={renderLink} />
        ) : null}
      </div>
    </AppShellContext.Provider>
  );
}

interface MobileNavProps {
  items: MobileNavItem[];
  activeId?: string | undefined;
  renderLink?: ((props: LinkRenderProps) => ReactNode) | undefined;
}

/** The phone tab bar. Hidden above 640 px. */
export function MobileNav({ items, activeId, renderLink }: MobileNavProps) {
  return (
    <nav className={styles.mobileNav} aria-label="Main">
      <ul className={styles.mobileList}>
        {items.map((item) => {
          const ItemIcon = item.icon;
          const current = item.id === activeId ? ("page" as const) : undefined;
          const label =
            item.count !== undefined && item.count > 0 ? `${item.label}, ${item.count}` : undefined;
          const body = (
            <>
              <span className={styles.mobileIcon}>
                <ItemIcon size={22} />
                {item.count !== undefined && item.count > 0 ? (
                  <span className={styles.mobileBadge} aria-hidden="true">
                    {item.count > 99 ? "99+" : item.count}
                  </span>
                ) : null}
              </span>
              <span className={styles.mobileLabel}>{item.label}</span>
            </>
          );
          return (
            <li key={item.id}>
              {item.href && renderLink ? (
                renderLink({
                  href: item.href,
                  className: styles.mobileItem ?? "",
                  children: body,
                  "aria-current": current,
                  "aria-label": label,
                  ...(item.onSelect ? { onClick: item.onSelect } : {}),
                })
              ) : item.href ? (
                <a
                  href={item.href}
                  className={styles.mobileItem}
                  aria-current={current}
                  aria-label={label}
                  onClick={item.onSelect}
                >
                  {body}
                </a>
              ) : (
                <button
                  type="button"
                  className={styles.mobileItem}
                  aria-current={current}
                  aria-label={label}
                  onClick={item.onSelect}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
