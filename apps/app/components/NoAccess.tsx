"use client";
import { LockIcon } from "@dueproof/icons";
import { EmptyState } from "@dueproof/ui";

/** "You don't have access", naming who can help (01 §4 "When things go wrong"). */
export function NoAccess({ what, admins }: { what: string; admins: string[] }) {
  const who =
    admins.length === 0
      ? "an administrator"
      : admins.length === 1
        ? admins[0]
        : `${admins.slice(0, -1).join(", ")} or ${admins.at(-1)}`;
  return (
    <EmptyState
      icon={LockIcon}
      title="You don't have access to this"
      description={`${what} is for owners and admins. Ask ${who} if you need a change made.`}
    />
  );
}
