"use client";
import { LockIcon } from "@dueproof/icons";
import { EmptyState } from "@dueproof/ui";

/** 01 §4 "No permission": a clear page that names who to ask. */
export function PermissionDenied({ admins, what }: { admins: string[]; what: string }) {
  const ask =
    admins.length > 0
      ? `Ask ${admins.slice(0, 2).join(" or ")} to give you access.`
      : "Ask an admin of your organisation to give you access.";
  return (
    <div>
      <EmptyState
        icon={LockIcon}
        size="hero"
        headingLevel={2}
        title={`You don't have access to ${what}`}
        description={ask}
      />
    </div>
  );
}
