"use client";
/**
 * One deadline's working: its basis, adjustments, warnings, window and
 * source, and the page that proves it. Opens from every Deadlines view (H3).
 */
import { ProofIcon } from "@dueproof/icons";
import {
  Badge,
  Banner,
  Button,
  Dialog,
  DueChip,
  InsetGroupedList,
  Link,
  ListRow,
  longDate,
} from "@dueproof/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProofPanel } from "@/components/ProofSheet";
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
  const router = useRouter();
  const [showPage, setShowPage] = useState(false);
  const rowId = row?.id;
  // Each deadline opens with its page hidden.
  useEffect(() => {
    if (rowId) setShowPage(false);
  }, [rowId]);
  if (!row) return null;
  const unfiled = row.unfiled && row.status === "open";
  const caseHref = row.caseId
    ? `/notices/${row.caseId}${row.findingId ? `?finding=${row.findingId}` : ""}`
    : null;
  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={row.title}
      description={row.clientName ?? "No client yet"}
      size={showPage ? "lg" : "md"}
      footer={
        <>
          {caseHref ? (
            <Button variant="secondary" onClick={() => router.push(caseHref)}>
              Open the case
            </Button>
          ) : unfiled ? (
            <Button variant="secondary" onClick={() => router.push("/inbox")}>
              File it from the Inbox
            </Button>
          ) : null}
          {/* Viewers read only: no button the server would refuse. */}
          {!data.canEdit ? null : row.status === "open" ? (
            <Button variant="primary" onClick={() => cmd.done(row)}>
              Mark done
            </Button>
          ) : (
            <Button onClick={() => cmd.reopen(row)}>Reopen</Button>
          )}
        </>
      }
    >
      <div className={styles.stack}>
        <div className={styles.rowTitle}>
          {unfiled ? (
            <Badge size="sm">Not filed yet · {longDate(row.dueOn)}</Badge>
          ) : (
            <DueChip state={row.state} detail={longDate(row.dueOn)} />
          )}
          <Badge size="sm">{SOURCE_LABEL[row.source]}</Badge>
          {row.statutory && !row.statutory.verified ? (
            <Badge size="sm" tone="warning">
              Rule not yet checked by a CA
            </Badge>
          ) : null}
        </div>
        {unfiled ? (
          <Banner tone="info" title="Read from a document not filed in a case">
            It isn't counted as due until someone files the document in a case. If it isn't a
            notice, set it aside in the Inbox.
          </Banner>
        ) : null}
        {row.documentId ? (
          <div className={styles.stack}>
            <div>
              <Button
                icon={ProofIcon}
                variant="secondary"
                aria-expanded={showPage}
                onClick={() => setShowPage((s) => !s)}
              >
                {showPage ? "Hide the page" : "Show on the page"}
              </Button>
            </div>
            {showPage ? <ProofPanel documentId={row.documentId} findingId={row.findingId} /> : null}
          </div>
        ) : null}
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
