import { CalendarDaysIcon, CameraIcon, HomeIcon, InboxIcon, MenuIcon } from "@dueproof/icons";
import type { ReactNode } from "react";
import { AppShell } from "../components/AppShell/AppShell";
import { Avatar } from "../components/Avatar/Avatar";
import { NotificationCenter } from "../components/NotificationCenter/NotificationCenter";
import { SidebarNav } from "../components/SidebarNav/SidebarNav";
import { navSections, notifications } from "./fixtures";

/** Story-only chrome: the firm's mark, the signed-in person, and a ready-made shell. */
export function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-8)", minWidth: 0 }}>
      <span
        aria-hidden="true"
        style={{
          flex: "none",
          width: "var(--dp-space-24)",
          height: "var(--dp-space-24)",
          borderRadius: "var(--dp-radius-sm)",
          background:
            "linear-gradient(135deg, var(--dp-accent-solid) 60%, var(--dp-proof-highlight) 60%)",
        }}
      />
      <span
        style={{
          font: "var(--dp-text-headline-font)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        Mehta Iyer & Co.
      </span>
    </div>
  );
}

export function SidebarFooter() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-8)" }}>
      <Avatar name="Priya Sharma" size="sm" />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: "var(--dp-text-subhead-font)",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        Priya Sharma
      </span>
      <NotificationCenter notifications={notifications} onMarkAllRead={() => {}} />
    </div>
  );
}

export const mobileNav = [
  { id: "today", label: "Today", icon: HomeIcon, href: "#today" },
  { id: "deadlines", label: "Deadlines", icon: CalendarDaysIcon, href: "#deadlines" },
  { id: "capture", label: "Capture", icon: CameraIcon, href: "#capture" },
  { id: "inbox", label: "Inbox", icon: InboxIcon, href: "#inbox", count: 12 },
  { id: "more", label: "More", icon: MenuIcon, href: "#more" },
];

export function DemoShell({
  active,
  children,
  banner,
  collapsed,
}: {
  active: string;
  children: ReactNode;
  banner?: ReactNode;
  collapsed?: boolean;
}) {
  return (
    <AppShell
      banner={banner}
      defaultSidebarCollapsed={collapsed ?? false}
      sidebar={
        <SidebarNav
          sections={navSections()}
          activeId={active}
          header={<Wordmark />}
          footer={<SidebarFooter />}
        />
      }
      mobileNav={mobileNav}
      mobileNavActiveId={active}
    >
      {children}
    </AppShell>
  );
}
