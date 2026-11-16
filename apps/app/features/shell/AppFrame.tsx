"use client";
/**
 * The signed-in app frame: sidebar (from lib/nav.ts), the phone tab bar,
 * ⌘K command palette, notification centre and the user menu (theme,
 * density, sign out). Pages render inside it.
 */
import { authClient } from "@dueproof/auth/client";
import {
  AddIcon,
  ClientIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SlidersIcon,
  SunIcon,
  UploadIcon,
} from "@dueproof/icons";
import type { Density, Theme } from "@dueproof/tokens";
import {
  AppShell,
  Avatar,
  type Command,
  CommandPalette,
  isTypingTarget,
  type LinkRenderProps,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  NotificationCenter,
  SidebarNav,
  type SidebarNavSection,
  useAppShell,
  useToast,
  VisuallyHidden,
} from "@dueproof/ui";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { setPreferences } from "@/app/actions/settings";
import { DesktopAlerts } from "@/components/DesktopAlerts";
import { Wordmark } from "@/components/Wordmark";
import { activeNavId, MOBILE_NAV, NAV, NAV_ITEMS } from "@/lib/nav";
import { PREFS_STORAGE_KEY, type Preferences } from "@/lib/preferences";
import styles from "./AppFrame.module.css";

export interface FrameViewer {
  name: string;
  email: string;
  orgName: string;
  role: string;
}

export function renderLink({ href, className, children, onClick, ...aria }: LinkRenderProps) {
  return (
    <NextLink href={href} className={className} {...(onClick ? { onClick } : {})} {...aria}>
      {children}
    </NextLink>
  );
}

/** Apply a preference at once (attribute + localStorage) and keep it in a cookie. */
export function usePreferences(initial: Preferences) {
  const [prefs, setPrefs] = useState(initial);
  const update = (change: Partial<Preferences>) => {
    const next = { ...prefs, ...change };
    setPrefs(next);
    const root = document.documentElement;
    root.dataset.theme = next.theme;
    root.dataset.density = next.density;
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private mode: the cookie still carries it.
    }
    void setPreferences(change);
  };
  return [prefs, update] as const;
}

function UserMenu({ viewer, prefs }: { viewer: FrameViewer; prefs: Preferences }) {
  const router = useRouter();
  const { toast } = useToast();
  const [current, update] = usePreferences(prefs);
  const signOut = async () => {
    const res = await authClient.signOut();
    if (res.error) {
      toast({ title: "Couldn't sign out", description: "Try again.", tone: "danger" });
      return;
    }
    router.replace("/sign-in");
    router.refresh();
  };
  return (
    <Menu>
      <MenuTrigger>
        {/* Named by its visible text (WCAG 2.5.3), so voice control can say what it sees. */}
        <button type="button" className={styles.userButton}>
          <span aria-hidden="true">
            <Avatar name={viewer.name || viewer.email} size="sm" />
          </span>
          <span className={styles.userText}>
            <span className={styles.userName}>{viewer.name || viewer.email}</span>
            <span className={styles.userOrg}>{viewer.orgName}</span>
          </span>
          <VisuallyHidden>, account menu</VisuallyHidden>
        </button>
      </MenuTrigger>
      <MenuContent side="top" align="start">
        <MenuLabel>{viewer.email}</MenuLabel>
        <MenuSeparator />
        <MenuLabel>Theme</MenuLabel>
        <MenuRadioGroup value={current.theme} onValueChange={(v) => update({ theme: v as Theme })}>
          <MenuRadioItem value="light">
            <SunIcon size={16} /> Light
          </MenuRadioItem>
          <MenuRadioItem value="dark">
            <MoonIcon size={16} /> Dark
          </MenuRadioItem>
          <MenuRadioItem value="system">
            <MonitorIcon size={16} /> Match system
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuLabel>Density</MenuLabel>
        <MenuRadioGroup
          value={current.density}
          onValueChange={(v) => update({ density: v as Density })}
        >
          <MenuRadioItem value="comfortable">Comfortable</MenuRadioItem>
          <MenuRadioItem value="compact">Compact</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem icon={SettingsIcon} onSelect={() => router.push("/settings/me")}>
          Your settings
        </MenuItem>
        <MenuItem icon={LogOutIcon} onSelect={signOut}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** Lets the phone tab bar's "More" open the sidebar drawer (the shell's context is inside it). */
function ShellBridge({ onReady }: { onReady: (toggle: () => void) => void }) {
  const { toggleSidebar } = useAppShell();
  useEffect(() => onReady(toggleSidebar), [onReady, toggleSidebar]);
  return null;
}

/** "G" then a letter jumps to a section (never while typing). */
function useGoShortcuts(go: (href: string) => void) {
  useEffect(() => {
    const map = new Map<string, string>();
    for (const item of NAV_ITEMS) {
      const key = item.shortcut?.match(/^G (\w)$/)?.[1];
      if (key) map.set(key.toLowerCase(), item.href);
    }
    let armed = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (armed && Date.now() - armed < 1200 && map.has(k)) {
        e.preventDefault();
        armed = 0;
        go(map.get(k) as string);
        return;
      }
      armed = k === "g" ? Date.now() : 0;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
}

export function AppFrame({
  viewer,
  prefs,
  children,
}: {
  viewer: FrameViewer;
  prefs: Preferences;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const active = activeNavId(pathname);
  const toggleRef = useRef<() => void>(() => {});
  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);

  useGoShortcuts(router.push);

  const sections: SidebarNavSection[] = useMemo(
    () =>
      NAV.map((s) => ({
        id: s.id,
        ...(s.title ? { title: s.title } : {}),
        items: s.items.map((i) => ({
          id: i.id,
          label: i.label,
          icon: i.icon,
          href: i.href,
          ...(i.shortcut ? { shortcut: i.shortcut } : {}),
        })),
      })),
    [],
  );

  const commands: Command[] = useMemo(() => {
    const goTo: Command[] = NAV_ITEMS.map((i) => ({
      id: `go-${i.id}`,
      label: i.label,
      group: "Go to",
      icon: i.icon,
      ...(i.shortcut ? { shortcut: i.shortcut.split(" ") } : {}),
      ...(i.keywords ? { keywords: i.keywords } : {}),
      onSelect: () => router.push(i.href),
    }));
    const actions: Command[] = [
      {
        id: "upload",
        label: "Upload a notice",
        group: "Actions",
        icon: UploadIcon,
        keywords: ["file", "pdf", "add"],
        onSelect: () => router.push("/inbox?upload=1"),
      },
      {
        id: "new-client",
        label: "New client",
        group: "Actions",
        icon: AddIcon,
        keywords: ["client", "add"],
        onSelect: () => router.push("/clients?new=1"),
      },
      {
        id: "team",
        label: "Invite people",
        group: "Actions",
        icon: ClientIcon,
        keywords: ["team", "invite", "member"],
        onSelect: () => router.push("/settings/team"),
      },
      {
        id: "prefs",
        label: "Theme and density",
        group: "Actions",
        icon: SlidersIcon,
        keywords: ["dark", "light", "compact"],
        onSelect: () => router.push("/settings/me"),
      },
    ];
    const q = query.trim();
    const search: Command[] = q
      ? [
          {
            id: "search",
            label: `Search for “${q}”`,
            group: "Search",
            icon: SearchIcon,
            keywords: [q],
            onSelect: () => router.push(`/search?q=${encodeURIComponent(q)}`),
          },
        ]
      : [];
    return [...search, ...goTo, ...actions];
  }, [router, query]);

  const mobileNav = MOBILE_NAV.map((m) =>
    m.id === "more"
      ? { id: m.id, label: m.label, icon: m.icon, onSelect: () => toggleRef.current() }
      : { id: m.id, label: m.label, icon: m.icon, href: m.href },
  );

  return (
    <AppShell
      sidebar={
        <SidebarNav
          sections={sections}
          activeId={active}
          renderLink={renderLink}
          header={<Wordmark name={viewer.orgName} />}
          footer={
            <div className={styles.footer}>
              <UserMenu viewer={viewer} prefs={prefs} />
              <NotificationCenter
                notifications={[]}
                footer={<span className={styles.muted}>Reminders and mentions appear here.</span>}
              />
            </div>
          }
        />
      }
      mobileNav={mobileNav}
      {...(active ? { mobileNavActiveId: active } : {})}
      renderLink={renderLink}
    >
      <ShellBridge
        onReady={(toggle) => {
          toggleRef.current = toggle;
        }}
      />
      {children}
      <DesktopAlerts />
      <CommandPalette
        commands={commands}
        open={paletteOpen}
        onOpenChange={(o) => {
          setPaletteOpen(o);
          if (!o) setQuery("");
        }}
        onQueryChange={setQuery}
        groupOrder={["Search", "Go to", "Actions"]}
        placeholder="Search notices, clients, or jump to…"
      />
    </AppShell>
  );
}
