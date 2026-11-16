"use client";
/**
 * The Settings page: title, section navigation (links, so each section has
 * its own URL), and the save bar a section shows when it has changes.
 */
import {
  AiSuggestedIcon,
  ClientIcon,
  ListChecksIcon,
  MonitorIcon,
  UserIcon,
  UsersIcon,
  WhatsappIntakeIcon,
} from "@dueproof/icons";
import type { LinkRenderProps } from "@dueproof/ui";
import { type SettingsNavItem, SettingsPageTemplate } from "@dueproof/ui";
import NextLink from "next/link";
import type { ReactNode } from "react";

export type SettingsSectionId =
  | "me"
  | "organisation"
  | "team"
  | "ai"
  | "profiles"
  | "intake"
  | "system";

export interface SettingsChrome {
  orgName: string;
  members: number;
  edition: "self-hosted" | "hosted" | "desktop";
  /** Owners and admins see the organisation's sections. */
  isAdmin: boolean;
}

const EDITION: Record<SettingsChrome["edition"], string> = {
  "self-hosted": "self-hosted",
  hosted: "hosted",
  desktop: "desktop",
};

export function settingsSections(chrome: SettingsChrome): SettingsNavItem[] {
  const all: Array<SettingsNavItem & { admin?: boolean }> = [
    { id: "me", label: "Me", icon: UserIcon, href: "/settings/me" },
    {
      id: "organisation",
      label: "Organisation",
      icon: ClientIcon,
      href: "/settings/organisation",
      admin: true,
    },
    { id: "team", label: "Team & access", icon: UsersIcon, href: "/settings/team" },
    { id: "ai", label: "AI", icon: AiSuggestedIcon, href: "/settings/ai", admin: true },
    {
      id: "profiles",
      label: "Profiles",
      icon: ListChecksIcon,
      href: "/settings/profiles",
      admin: true,
    },
    { id: "intake", label: "Intake", icon: WhatsappIntakeIcon, href: "/settings/intake" },
    {
      id: "system",
      label: "System",
      icon: MonitorIcon,
      href: "/settings/system",
      admin: true,
      ...(chrome.edition === "self-hosted" ? { badge: "Self-hosted" } : {}),
    },
  ];
  return all.filter((s) => chrome.isAdmin || !s.admin).map(({ admin: _admin, ...s }) => s);
}

function renderLink({ href, className, children, onClick, ...aria }: LinkRenderProps) {
  return (
    <NextLink href={href} className={className} {...(onClick ? { onClick } : {})} {...aria}>
      {children}
    </NextLink>
  );
}

export function SettingsFrame({
  chrome,
  section,
  children,
  banner,
  dirty = false,
  saving = false,
  onSave,
  onDiscard,
}: {
  chrome: SettingsChrome;
  section: SettingsSectionId;
  children: ReactNode;
  banner?: ReactNode;
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
}) {
  const people = chrome.members === 1 ? "1 person" : `${chrome.members} people`;
  return (
    <SettingsPageTemplate
      title="Settings"
      subtitle={`${chrome.orgName} · ${people} · ${EDITION[chrome.edition]}`}
      sections={settingsSections(chrome)}
      activeSection={section}
      renderLink={renderLink}
      banner={banner}
      dirty={dirty}
      saving={saving}
      {...(onSave ? { onSave } : {})}
      {...(onDiscard ? { onDiscard } : {})}
    >
      {children}
    </SettingsPageTemplate>
  );
}
