import { AddIcon, NoticeIcon, UserIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState } from "react";
import { makeNotices, type NoticeRow } from "../../stories/fixtures";
import { noticeColumns } from "../../stories/noticeColumns";
import { Button } from "../Button/Button";
import { EmptyState } from "../EmptyState/EmptyState";
import { DataTable } from "./DataTable";

const meta: Meta<typeof DataTable<NoticeRow>> = {
  title: "Structure/DataTable",
  component: DataTable,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ height: "36rem", display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DataTable<NoticeRow>>;

const base = {
  label: "Notices",
  columns: noticeColumns,
  getRowId: (r: NoticeRow) => r.id,
};

export const Default: Story = {
  render: function Render() {
    const data = useMemo(() => makeNotices(60), []);
    const [active, setActive] = useState<string>();
    return (
      <DataTable
        {...base}
        data={data}
        defaultSorting={[{ id: "due", desc: false }]}
        activeRowId={active}
        onRowClick={(r) => setActive(r.id)}
      />
    );
  },
};

/** 5 000 rows, virtualised: only the visible rows are in the DOM. */
export const FiveThousandRows: Story = {
  render: function Render() {
    const data = useMemo(() => makeNotices(5000), []);
    return <DataTable {...base} data={data} selectable />;
  },
};

export const SelectionWithBulkActions: Story = {
  render: function Render() {
    const data = useMemo(() => makeNotices(40), []);
    return (
      <DataTable
        {...base}
        data={data}
        selectable
        defaultSelectedIds={["case-1", "case-3", "case-4"]}
        bulkActions={({ ids }) => (
          <>
            <Button size="sm" icon={UserIcon}>
              Assign
            </Button>
            <Button size="sm">Move stage</Button>
            <Button size="sm" variant="ghost">
              Export {ids.length}
            </Button>
          </>
        )}
      />
    );
  },
};

export const Loading: Story = {
  render: () => <DataTable {...base} data={[]} loading selectable />,
};

export const Empty: Story = {
  render: () => (
    <DataTable
      {...base}
      data={[]}
      empty={
        <EmptyState
          size="compact"
          headingLevel={3}
          icon={NoticeIcon}
          title="No notices yet"
          description="Upload a notice, forward one by email, or send a photo on WhatsApp."
          actions={
            <Button variant="primary" icon={AddIcon}>
              Upload notice
            </Button>
          }
        />
      }
    />
  ),
};

export const NoMatches: Story = { render: () => <DataTable {...base} data={[]} /> };

export const LoadError: Story = {
  render: () => (
    <DataTable
      {...base}
      data={[]}
      error={{
        title: "Couldn't load notices",
        description: "The server didn't answer. Your data is safe; try again in a moment.",
        onRetry: () => {},
      }}
    />
  ),
};
