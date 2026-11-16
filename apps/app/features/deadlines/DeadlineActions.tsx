"use client";
/**
 * The per-deadline menu: mark done, reassign, snooze, dismiss. Each change
 * shows a toast with Undo, which puts the deadline back as it was.
 */
import {
  CalendarClockIcon,
  CloseIcon,
  DoneIcon,
  MoreIcon,
  UndoIcon,
  UserIcon,
} from "@dueproof/icons";
import {
  addDays,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  shortDate,
  useToast,
} from "@dueproof/ui";
import type { ActionResult } from "@/lib/action";
import type { DeadlineRow } from "@/lib/deadline-rows";
import {
  dismissDeadline,
  markDeadlineDone,
  reassignDeadline,
  restoreDeadline,
  snoozeDeadline,
} from "./actions";
import type { DeadlinesPageData } from "./queries";

type Snapshot = Parameters<typeof restoreDeadline>[0];

export function useDeadlineCommands(onChanged: () => void) {
  const { toast } = useToast();
  async function run(promise: Promise<ActionResult<Snapshot>>, title: string) {
    const res = await promise;
    if (!res.ok) {
      toast({ title: "Couldn't change the deadline", description: res.message, tone: "danger" });
      return;
    }
    onChanged();
    toast({
      title,
      tone: "success",
      action: {
        label: "Undo",
        altText: "Undo the last change",
        onClick: async () => {
          const back = await restoreDeadline(res.data);
          if (!back.ok)
            toast({ title: "Couldn't undo", description: back.message, tone: "danger" });
          onChanged();
        },
      },
    });
  }
  return {
    done: (r: DeadlineRow) => run(markDeadlineDone(r.id), `Marked done: ${r.title}`),
    reopen: (r: DeadlineRow) =>
      restoreDeadline({
        id: r.id,
        status: "open",
        ownerUserId: r.ownerUserId,
        snoozedUntil: null,
      }).then((res) => {
        if (!res.ok) toast({ title: "Couldn't reopen", description: res.message, tone: "danger" });
        onChanged();
      }),
    assign: (r: DeadlineRow, userId: string | null, name: string) =>
      run(reassignDeadline(r.id, userId), userId ? `Assigned to ${name}` : "Unassigned"),
    snooze: (r: DeadlineRow, until: string | null) =>
      run(
        snoozeDeadline(r.id, until),
        until ? `Snoozed until ${shortDate(until)}` : "Snooze cleared",
      ),
    dismiss: (r: DeadlineRow) => run(dismissDeadline(r.id), `Dismissed: ${r.title}`),
  };
}

export function DeadlineActions({
  row,
  data,
  onChanged,
}: {
  row: DeadlineRow;
  data: Pick<DeadlinesPageData, "people" | "today" | "me">;
  onChanged: () => void;
}) {
  const cmd = useDeadlineCommands(onChanged);
  const open = row.status === "open";
  return (
    <Menu>
      <MenuTrigger>
        <IconButton icon={MoreIcon} label={`Actions for ${row.title}`} size="sm" variant="ghost" />
      </MenuTrigger>
      <MenuContent align="end">
        {open ? (
          <MenuItem icon={DoneIcon} onSelect={() => cmd.done(row)}>
            Mark done
          </MenuItem>
        ) : (
          <MenuItem icon={UndoIcon} onSelect={() => cmd.reopen(row)}>
            Reopen
          </MenuItem>
        )}
        <MenuSub>
          <MenuSubTrigger icon={UserIcon}>Assign to</MenuSubTrigger>
          <MenuSubContent>
            {data.people.map((p) => (
              <MenuItem key={p.id} onSelect={() => cmd.assign(row, p.id, p.name)}>
                {p.id === data.me ? `${p.name} (me)` : p.name}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem onSelect={() => cmd.assign(row, null, "")}>Nobody</MenuItem>
          </MenuSubContent>
        </MenuSub>
        {open ? (
          <MenuSub>
            <MenuSubTrigger icon={CalendarClockIcon}>Snooze</MenuSubTrigger>
            <MenuSubContent>
              <MenuItem onSelect={() => cmd.snooze(row, addDays(data.today, 1))}>
                Until tomorrow
              </MenuItem>
              <MenuItem onSelect={() => cmd.snooze(row, addDays(data.today, 3))}>
                For 3 days
              </MenuItem>
              <MenuItem onSelect={() => cmd.snooze(row, addDays(data.today, 7))}>
                For a week
              </MenuItem>
              {row.snoozedUntil ? (
                <MenuItem onSelect={() => cmd.snooze(row, null)}>Clear snooze</MenuItem>
              ) : null}
            </MenuSubContent>
          </MenuSub>
        ) : null}
        {open ? (
          <>
            <MenuSeparator />
            <MenuItem icon={CloseIcon} destructive onSelect={() => cmd.dismiss(row)}>
              Dismiss
            </MenuItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
