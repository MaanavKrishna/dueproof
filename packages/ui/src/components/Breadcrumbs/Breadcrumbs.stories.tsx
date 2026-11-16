import type { Meta, StoryObj } from "@storybook/react-vite";
import { Breadcrumbs } from "./Breadcrumbs";

const meta = {
  title: "Structure/Breadcrumbs",
  component: Breadcrumbs,
  args: {
    items: [
      { id: "clients", label: "Clients", href: "#" },
      { id: "c1", label: "Harbour Valley Foods Pvt Ltd", href: "#" },
      { id: "ref", label: "ASMT-10 · ZD2710260012345" },
    ],
  },
} satisfies Meta<typeof Breadcrumbs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Folded: Story = {
  args: {
    items: [
      { id: "settings", label: "Settings", href: "#" },
      { id: "org", label: "Organisation", href: "#" },
      { id: "team", label: "Team & access", href: "#" },
      { id: "roles", label: "Roles", href: "#" },
      { id: "partner", label: "Partner" },
    ],
  },
};

export const SingleLevel: Story = { args: { items: [{ id: "today", label: "Today" }] } };
