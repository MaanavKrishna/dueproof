import { CalendarIcon, GridIcon, ListChecksIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { SegmentedControl } from "./SegmentedControl";

const views = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
  { value: "calendar", label: "Calendar" },
];

const meta = {
  title: "Forms/SegmentedControl",
  component: SegmentedControl,
  args: { "aria-label": "View", segments: views },
} satisfies Meta<typeof SegmentedControl>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <Stack>
      <SegmentedControl
        aria-label="Range"
        defaultValue="week"
        segments={[
          { value: "today", label: "Today" },
          { value: "week", label: "This week" },
          { value: "month", label: "This month" },
          { value: "all", label: "All" },
        ]}
      />
      <SegmentedControl
        aria-label="View with icons"
        segments={[
          { value: "list", label: "List", icon: ListChecksIcon },
          { value: "board", label: "Board", icon: GridIcon },
          { value: "calendar", label: "Calendar", icon: CalendarIcon },
        ]}
      />
      <SegmentedControl
        aria-label="View, icons only"
        segments={[
          { value: "list", label: "List", icon: ListChecksIcon, iconOnly: true },
          { value: "board", label: "Board", icon: GridIcon, iconOnly: true },
          { value: "calendar", label: "Calendar", icon: CalendarIcon, iconOnly: true },
        ]}
      />
      <SegmentedControl aria-label="Small" size="sm" segments={views} />
      <SegmentedControl
        aria-label="With a disabled segment"
        segments={[...views.slice(0, 2), { value: "calendar", label: "Calendar", disabled: true }]}
      />
      <SegmentedControl aria-label="Disabled" segments={views} disabled />
      <div style={{ maxWidth: "420px" }}>
        <SegmentedControl aria-label="Full width" segments={views} fullWidth />
      </div>
    </Stack>
  ),
};
