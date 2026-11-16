import {
  DownloadIcon,
  ExposureIcon,
  OverdueIcon,
  ProofIcon,
  UploadIcon,
  UserIcon,
} from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState } from "react";
import { Amount } from "../components/Amount/Amount";
import { Button } from "../components/Button/Button";
import { Calendar } from "../components/Calendar/Calendar";
import { StatCard } from "../components/Card/Card";
import { DataTable } from "../components/DataTable/DataTable";
import { FilterBar, type FilterValue } from "../components/FilterBar/FilterBar";
import { FindingCard } from "../components/FindingCard/FindingCard";
import { NoticeHeader } from "../components/NoticeHeader/NoticeHeader";
import { SearchField } from "../components/SearchField/SearchField";
import { SegmentedControl } from "../components/SegmentedControl/SegmentedControl";
import {
  asmt10Findings,
  calendarEvents,
  holidays,
  makeNotices,
  type NoticeRow,
  noticeFilters,
  TODAY,
} from "../stories/fixtures";
import { noticeColumns } from "../stories/noticeColumns";
import { DemoShell } from "../stories/shell";
import { ListPageTemplate } from "./ListPageTemplate";

const meta: Meta<typeof ListPageTemplate> = {
  title: "Templates/List page",
  component: ListPageTemplate,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof ListPageTemplate>;

const views = [
  { id: "all", name: "All open notices" },
  { id: "mine", name: "Assigned to me" },
  { id: "partner", name: "Awaiting partner approval", shared: true },
  { id: "big", name: "Demand over ₹10 lakh", shared: true },
];

function RowInspector({ row }: { row: NoticeRow }) {
  const reply = asmt10Findings[0];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--dp-space-16)",
        padding: "var(--dp-space-16)",
      }}
    >
      <NoticeHeader
        headingLevel={2}
        authority={
          row.type.startsWith("GST") ? "gst" : row.type.startsWith("ROC") ? "roc" : "income-tax"
        }
        type={row.type}
        reference={row.reference}
        issuingOffice={row.issuedBy}
        {...(row.demand ? { amount: row.demand } : {})}
        received={row.received}
        client={{ name: row.client, identifier: row.gstin }}
        owner={{ name: row.owner }}
        stage={row.stage}
      />
      {reply ? (
        <FindingCard
          duty={reply.duty}
          {...(row.nextDue ? { due: { state: row.nextDue.state, date: row.nextDue.date } } : {})}
          basis={`30 days from receipt on ${row.received}`}
          owner={{ name: row.owner }}
          status={reply.status}
          origin="rule"
          verification={{ state: "verified", page: 1 }}
          grade="exact"
          sourceLabel="Page 1"
          onShowSource={() => {}}
        />
      ) : null}
    </div>
  );
}

/** Notices: the register, 5 000 cases, virtualised, with filters, saved views and an inspector. */
export const Notices: Story = {
  render: function Render() {
    const data = useMemo(() => makeNotices(5000), []);
    const [filters, setFilters] = useState<FilterValue>({ due: ["week"] });
    const [view, setView] = useState("all");
    const [open, setOpen] = useState<NoticeRow | null>(data[0] ?? null);
    const overdue = data.filter((d) => d.nextDue?.state === "overdue").length;
    return (
      <DemoShell active="notices">
        <ListPageTemplate
          title="Notices"
          subtitle={`${data.length.toLocaleString("en-IN")} cases · ${overdue.toLocaleString("en-IN")} overdue`}
          actions={
            <>
              <Button icon={DownloadIcon}>Export CSV</Button>
              <Button variant="primary" icon={UploadIcon}>
                Upload notice
              </Button>
            </>
          }
          filterBar={
            <FilterBar
              filters={noticeFilters}
              value={filters}
              onChange={setFilters}
              views={views}
              activeViewId={view}
              onViewSelect={setView}
              onSaveView={() => {}}
              search={
                <SearchField
                  label="Search notices"
                  size="sm"
                  placeholder="Client, reference, GSTIN"
                />
              }
              trailing={
                <SegmentedControl
                  aria-label="View"
                  size="sm"
                  defaultValue="list"
                  segments={[
                    { value: "list", label: "List" },
                    { value: "calendar", label: "Calendar" },
                  ]}
                />
              }
            />
          }
          inspector={open ? <RowInspector row={open} /> : undefined}
          inspectorTitle={open ? `${open.type} · ${open.client}` : undefined}
          inspectorOpen={open !== null}
          onInspectorOpenChange={(o) => {
            if (!o) setOpen(null);
          }}
          inspectorActions={
            <Button size="sm" variant="plain" icon={ProofIcon}>
              Open case
            </Button>
          }
        >
          <DataTable
            label="Notices"
            columns={noticeColumns}
            data={data}
            getRowId={(r) => r.id}
            selectable
            defaultSorting={[{ id: "due", desc: false }]}
            activeRowId={open?.id}
            onRowClick={setOpen}
            bulkActions={() => (
              <>
                <Button size="sm" icon={UserIcon}>
                  Assign
                </Button>
                <Button size="sm">Move stage</Button>
              </>
            )}
          />
        </ListPageTemplate>
      </DemoShell>
    );
  },
};

/** Inbox-style list with summary cards above the table. */
export const WithSummary: Story = {
  render: function Render() {
    const data = useMemo(() => makeNotices(80, 11), []);
    return (
      <DemoShell active="inbox">
        <ListPageTemplate
          title="Needs review"
          subtitle="Findings below the confidence bar, AI suggestions and unlocated passages"
          summary={
            <>
              <StatCard label="Overdue" icon={OverdueIcon} value="3" tone="attention" />
              <StatCard
                label="To review"
                icon={ProofIcon}
                value="12"
                footnote="4 not located on the page"
              />
              <StatCard
                label="Open demand"
                icon={ExposureIcon}
                value={<Amount minor={166_04_90_000} compact size="xl" />}
                delta={{
                  value: "+₹12.4 lakh",
                  direction: "up",
                  tone: "negative",
                  period: "since October",
                }}
              />
            </>
          }
        >
          <DataTable
            label="Needs review"
            columns={noticeColumns}
            data={data}
            getRowId={(r) => r.id}
            onRowClick={() => {}}
          />
        </ListPageTemplate>
      </DemoShell>
    );
  },
};

/** Deadlines as a calendar: notice deadlines, hearings and statutory filings together. */
export const DeadlinesCalendar: Story = {
  render: () => (
    <DemoShell active="deadlines">
      <ListPageTemplate
        title="Deadlines"
        subtitle="November 2026 · holidays shaded · times in IST"
        scrollPage
        actions={<Button>Subscribe (iCal)</Button>}
      >
        <Calendar label="Deadlines" events={calendarEvents} holidays={holidays} today={TODAY} />
      </ListPageTemplate>
    </DemoShell>
  ),
};

export const Loading: Story = {
  render: () => (
    <DemoShell active="notices">
      <ListPageTemplate title="Notices" subtitle="Loading…">
        <DataTable
          label="Notices"
          columns={noticeColumns}
          data={[]}
          getRowId={(r) => r.id}
          loading
        />
      </ListPageTemplate>
    </DemoShell>
  ),
};
