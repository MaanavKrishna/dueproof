import { Amount } from "../components/Amount/Amount";
import { Avatar } from "../components/Avatar/Avatar";
import type { DataTableColumn } from "../components/DataTable/DataTable";
import { DueChip } from "../components/DueChip/DueChip";
import { caseStages } from "../components/StageStepper/StageStepper";
import { StatusPill } from "../components/StatusPill/StatusPill";
import type { NoticeRow } from "./fixtures";

const stageOrder = new Map(caseStages.map((s, i) => [s.id, i]));
const stageLabel = new Map(caseStages.map((s) => [s.id, s.short]));
const dueOrder = { overdue: 0, today: 1, week: 2, later: 3, done: 4 } as const;

/** The Notices register's columns (01 §4): one row per case. */
export const noticeColumns: DataTableColumn<NoticeRow>[] = [
  {
    id: "client",
    header: "Client",
    width: "xl",
    accessor: (r) => r.client,
    cell: (r) => (
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0, lineHeight: 1.2 }}>
        <span
          style={{
            fontWeight: "var(--dp-font-weight-medium)",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {r.client}
        </span>
        <span style={{ font: "var(--dp-text-mono-font)", color: "var(--dp-fg-tertiary)" }}>
          {r.gstin}
        </span>
      </span>
    ),
  },
  { id: "type", header: "Type", width: "md", accessor: (r) => r.type },
  {
    id: "reference",
    header: "Reference",
    width: "md",
    accessor: (r) => r.reference,
    cell: (r) => <span style={{ font: "var(--dp-text-mono-font)" }}>{r.reference}</span>,
  },
  {
    id: "issuedBy",
    header: "Issued by",
    width: "lg",
    accessor: (r) => r.issuedBy,
    defaultHidden: true,
  },
  {
    id: "received",
    header: "Received",
    width: "sm",
    accessor: (r) => r.receivedIso,
    cell: (r) => r.received,
  },
  {
    id: "due",
    header: "Next due",
    width: "lg",
    accessor: (r) => (r.nextDue ? `${dueOrder[r.nextDue.state]}-${r.nextDue.iso}` : null),
    cell: (r) =>
      r.nextDue ? (
        <DueChip state={r.nextDue.state} detail={r.nextDue.date} size="sm" />
      ) : (
        <span style={{ color: "var(--dp-fg-tertiary)" }}>No deadline found</span>
      ),
  },
  {
    id: "stage",
    header: "Stage",
    width: "sm",
    accessor: (r) => stageOrder.get(r.stage) ?? 0,
    cell: (r) => (
      <StatusPill
        label={stageLabel.get(r.stage) ?? r.stage}
        tone={r.stage === "closed" ? "neutral" : r.stage === "approval" ? "warning" : "accent"}
      />
    ),
  },
  {
    id: "demand",
    header: "Demand",
    width: "sm",
    align: "end",
    accessor: (r) => r.demand,
    cell: (r) =>
      r.demand ? (
        <Amount minor={r.demand} compact />
      ) : (
        <span style={{ color: "var(--dp-fg-quaternary)" }}>—</span>
      ),
  },
  {
    id: "owner",
    header: "Owner",
    width: "md",
    accessor: (r) => r.owner,
    cell: (r) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--dp-space-6)" }}>
        <Avatar name={r.owner} size="xs" />
        {r.owner}
      </span>
    ),
  },
  {
    id: "language",
    header: "Language",
    width: "sm",
    accessor: (r) => r.language,
    defaultHidden: true,
  },
  { id: "channel", header: "Source", width: "xs", accessor: (r) => r.channel, defaultHidden: true },
];
