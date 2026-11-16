import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { noticeFilters } from "../../stories/fixtures";
import { SearchField } from "../SearchField/SearchField";
import { FilterBar, type FilterValue } from "./FilterBar";

const views = [
  { id: "mine", name: "My open notices" },
  { id: "gst-week", name: "GST due this week" },
  { id: "partner", name: "Awaiting partner approval", shared: true },
  { id: "big", name: "Demand over ₹10 lakh", shared: true },
];

function Controlled({ initial }: { initial: FilterValue }) {
  const [value, setValue] = useState<FilterValue>(initial);
  const [view, setView] = useState("mine");
  return (
    <FilterBar
      filters={noticeFilters}
      value={value}
      onChange={setValue}
      views={views}
      activeViewId={view}
      onViewSelect={setView}
      onSaveView={() => {}}
      search={
        <SearchField label="Search notices" size="sm" placeholder="Client, reference, GSTIN" />
      }
    />
  );
}

const meta = {
  title: "Structure/FilterBar",
  component: FilterBar,
  args: { filters: noticeFilters, value: {}, onChange: () => {} },
} satisfies Meta<typeof FilterBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { render: () => <Controlled initial={{}} /> };

export const WithFilters: Story = {
  render: () => <Controlled initial={{ client: ["c1", "c2"], due: ["week"], type: ["asmt10"] }} />,
};
