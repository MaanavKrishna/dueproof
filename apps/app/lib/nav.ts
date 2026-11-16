/**
 * The app's navigation (01 §3), in one place: the sidebar, the phone tab bar
 * and the command palette's "Go to" commands all read it. A lane that adds a
 * screen adds its route here and it appears everywhere.
 */
import {
  CalendarDaysIcon,
  CameraIcon,
  ClientIcon,
  DocumentIcon,
  HomeIcon,
  type Icon,
  InboxIcon,
  MenuIcon,
  NoticeIcon,
  SearchIcon,
  SettingsIcon,
} from "@dueproof/icons";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: Icon;
  /** "G T"-style shortcut, shown in tooltips and the palette. */
  shortcut?: string;
  /** Words that should find it in the palette. */
  keywords?: string[];
}

export interface NavSection {
  id: string;
  title?: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    id: "main",
    items: [
      {
        id: "today",
        label: "Today",
        href: "/today",
        icon: HomeIcon,
        shortcut: "G T",
        keywords: ["home"],
      },
      {
        id: "inbox",
        label: "Inbox",
        href: "/inbox",
        icon: InboxIcon,
        shortcut: "G I",
        keywords: ["uploads"],
      },
      {
        id: "notices",
        label: "Notices",
        href: "/notices",
        icon: NoticeIcon,
        shortcut: "G N",
        keywords: ["cases"],
      },
      {
        id: "deadlines",
        label: "Deadlines",
        href: "/deadlines",
        icon: CalendarDaysIcon,
        shortcut: "G D",
        keywords: ["calendar", "due", "hearings"],
      },
      { id: "clients", label: "Clients", href: "/clients", icon: ClientIcon, shortcut: "G C" },
      {
        id: "search",
        label: "Search",
        href: "/search",
        icon: SearchIcon,
        shortcut: "/",
        keywords: ["find", "full text", "reference", "gstin"],
      },
    ],
  },
  {
    id: "insight",
    title: "Insight",
    items: [
      { id: "ask", label: "Ask", href: "/ask", icon: SearchIcon, keywords: ["ai", "question"] },
      {
        id: "reports",
        label: "Reports",
        href: "/reports",
        icon: DocumentIcon,
        keywords: ["evidence", "csv", "statement", "workload", "exposure", "hearing pack"],
      },
      {
        id: "capture",
        label: "Capture",
        href: "/capture",
        icon: CameraIcon,
        keywords: ["camera", "photo", "scan", "upload"],
      },
    ],
  },
  {
    id: "firm",
    title: "Firm",
    items: [
      { id: "settings", label: "Settings", href: "/settings", icon: SettingsIcon, shortcut: "G S" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV.flatMap((s) => s.items);

/** The phone tab bar (02 §9): Today, Deadlines, Capture, Inbox, More. */
export const MOBILE_NAV = [
  { id: "today", label: "Today", href: "/today", icon: HomeIcon },
  { id: "deadlines", label: "Deadlines", href: "/deadlines", icon: CalendarDaysIcon },
  { id: "capture", label: "Capture", href: "/capture", icon: CameraIcon },
  { id: "inbox", label: "Inbox", href: "/inbox", icon: InboxIcon },
  { id: "more", label: "More", href: "", icon: MenuIcon },
] as const;

/** The nav item a path belongs to: the longest matching href. */
export function activeNavId(pathname: string): string | undefined {
  let best: NavItem | undefined;
  for (const item of NAV_ITEMS) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best?.id;
}
