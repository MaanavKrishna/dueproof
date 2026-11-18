"use client";
/** One deadline's working: its basis, adjustments, warnings, window and source. */
import {
  Badge,
  Button,
  Dialog,
  DueChip,
  InsetGroupedList,
  Link,
  ListRow,
  longDate,
} from "@dueproof/ui";
import type { DeadlineRow } from "@/lib/deadline-rows";
import { useDeadlineCommands } from "./DeadlineActions";
import styles from "./deadlines.module.css";
import { SOURCE_LABEL } from "./labels";
import type { DeadlinesPageData } from "./queries";

export function DeadlineDetailDialog({
  row,
  onOpenChange,
  people,
  data,
  onChanged,
}: {
  row: DeadlineRow | null;
  onOpenChange: (open: boolean) => void;
  people: Map<string, string>;
  data: DeadlinesPageData;
  onChanged: () => void;
}) {
  const cmd = useDeadlineCommands(onChanged);
  if (!row) return null;
  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={row.title}
      description={row.clientName ?? undefined}
      size="md"
      footer={
        !data.canEdit ? undefined : row.status === "open" ? (
          <Button variant="primary" onClick={() => cmd.done(row)}>
            Mark done
          </Button>
        ) : (
          <Button onClick={() => cmd.reopen(row)}>Reopen</Button>
        )
      }
    >
      <div className={styles.stack}>
        <div className={styles.rowTitle}>
          <DueChip state={row.state} detail={longDate(row.dueOn)} />
          <Badge size="sm">{SOURCE_LABEL[row.source]}</Badge>
        </div>
        <InsetGroupedList header="Why this date">
          <ListRow label="Basis" description={row.basis} />
          {row.windowEndOn ? (
            <ListRow
              label="Condonation window"
              description={`Separate date: ${longDate(row.windowEndOn)}${row.windowBasis ? `. ${row.windowBasis}` : ""}`}
            />
          ) : null}
          {row.adjustments.map((a) => (
            <ListRow key={a} label="Adjusted" description={a} />
          ))}
          {row.warnings.map((w) => (
            <ListRow key={w} label="Check" description={w} tone="danger" />
          ))}
          {row.statutory ? (
            <ListRow
              label={row.statutory.verified ? "Rule checked" : "Rule not yet checked by a CA"}
              description={
                <>
                  {row.statutory.citation} · calendar data as of {longDate(row.statutory.packAsOf)}{" "}
                  ·{" "}
                  <Link href={row.statutory.url} external>
                    Source
                  </Link>
                </>
              }
            />
          ) : null}
        </InsetGroupedList>
        <InsetGroupedList header="Work">
          <ListRow
            label="Owner"
            value={row.ownerUserId ? (people.get(row.ownerUserId) ?? "Someone") : "Unassigned"}
          />
          {row.caseId ? (
            <ListRow
              label="Case"
              value={row.caseTitle ?? "Open case"}
              href={`/notices/${row.caseId}`}
            />
          ) : null}
          {row.ackNumber ? <ListRow label="Acknowledgement" value={row.ackNumber} /> : null}
        </InsetGroupedList>
      </div>
    </Dialog>
  );
}
