import type { Meta, StoryObj } from "@storybook/react-vite";
import { notifications } from "../../stories/fixtures";
import { Link } from "../Link/Link";
import { NotificationCenter } from "./NotificationCenter";

const meta = {
  title: "Structure/NotificationCenter",
  component: NotificationCenter,
  args: {
    notifications,
    onMarkAllRead: () => {},
    footer: <Link href="#settings">Notification settings</Link>,
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof NotificationCenter>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = { args: { defaultOpen: true } };
export const Closed: Story = {};
export const AllRead: Story = {
  args: { defaultOpen: true, notifications: notifications.map((n) => ({ ...n, read: true })) },
};
export const Empty: Story = { args: { defaultOpen: true, notifications: [] } };
