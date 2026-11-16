import type { Meta, StoryObj } from "@storybook/react-vite";
import { calendarEvents, holidays, TODAY } from "../../stories/fixtures";
import { Calendar } from "./Calendar";

const meta = {
  title: "Structure/Calendar",
  component: Calendar,
  args: { events: calendarEvents, holidays, today: TODAY, label: "Deadlines" },
} satisfies Meta<typeof Calendar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Month: Story = {};
export const Week: Story = { args: { defaultView: "week" } };
export const NextMonth: Story = { args: { defaultDate: "2026-12-01" } };
export const Empty: Story = { args: { events: [], defaultDate: "2027-01-10" } };
