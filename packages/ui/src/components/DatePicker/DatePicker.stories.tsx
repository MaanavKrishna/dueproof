import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "../../stories/helpers";
import { addDays, weekday } from "../../utils/dates";
import { DatePicker, type DateResolver } from "./DatePicker";

/** A stand-in for packages/core's date engine: skips Sundays and the listed holidays. */
const holidays = { "2026-11-24": "Guru Nanak Jayanti", "2026-11-08": "Diwali" };
const resolve: DateResolver = (from, days, kind) => {
  if (kind === "calendar") return addDays(from, days);
  let d = from;
  let n = 0;
  while (n < days) {
    d = addDays(d, 1);
    if (weekday(d) !== 6 && !(d in holidays)) n++;
  }
  return d;
};

const meta = {
  title: "Structure/DatePicker",
  component: DatePicker,
  args: { label: "Reply due", today: "2026-11-16", holidays },
} satisfies Meta<typeof DatePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const WithValue: Story = { args: { defaultValue: "2026-11-20" } };

export const FromReceipt: Story = {
  args: {
    label: "Reply due",
    description: "Pick a date, or count from the date of receipt.",
    referenceDate: "2026-10-21",
    resolveDate: resolve,
    helpers: [
      { days: 15, kind: "calendar" },
      { days: 30, kind: "calendar" },
      { days: 7, kind: "working" },
    ],
  },
};

export const States: Story = {
  render: (args) => (
    <Stack width="20rem">
      <DatePicker {...args} label="Received on" defaultValue="2026-10-21" size="sm" />
      <DatePicker {...args} label="Hearing" min="2026-11-16" description="Only future dates." />
      <DatePicker
        {...args}
        label="Order date"
        error="The order date can't be before the notice date."
      />
      <DatePicker {...args} label="Filed on" defaultValue="2026-11-02" disabled />
    </Stack>
  ),
};
