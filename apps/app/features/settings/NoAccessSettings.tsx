"use client";
import { NoAccess } from "@/components/NoAccess";
import { type SettingsChrome, SettingsFrame, type SettingsSectionId } from "./SettingsFrame";

/** A Settings section this person may not open. */
export function NoAccessSettings({
  chrome,
  section,
  what,
  admins,
}: {
  chrome: SettingsChrome;
  section: SettingsSectionId;
  what: string;
  admins: string[];
}) {
  return (
    <SettingsFrame chrome={chrome} section={section}>
      <NoAccess what={what} admins={admins} />
    </SettingsFrame>
  );
}
