import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { Select } from "./Select";

const statuses = [
  { value: "new", label: "New" },
  { value: "review", label: "In review" },
  { value: "replied", label: "Replied" },
  { value: "closed", label: "Closed" },
];

const meta = {
  title: "Forms/Select",
  component: Select,
  args: { label: "Status", options: statuses },
} satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <Stack width="320px">
      <Select label="Status" options={statuses} />
      <Select label="Status (chosen)" options={statuses} defaultValue="review" />
      <Select
        label="Authority"
        options={[
          {
            label: "Indirect tax",
            options: [
              { value: "gst", label: "GST" },
              { value: "customs", label: "Customs" },
            ],
          },
          {
            label: "Direct tax",
            options: [
              { value: "it", label: "Income tax" },
              { value: "tds", label: "TDS", disabled: true },
            ],
          },
        ]}
      />
      <Select label="Assignee" options={statuses} error="Choose who replies." />
      <Select label="Locked" options={statuses} defaultValue="closed" disabled />
      <Select label="Small" options={statuses} size="sm" />
    </Stack>
  ),
};
