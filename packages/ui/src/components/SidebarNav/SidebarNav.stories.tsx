import type { Meta, StoryObj } from "@storybook/react-vite";
import { navSections } from "../../stories/fixtures";
import { SidebarFooter, Wordmark } from "../../stories/shell";
import { SidebarNav } from "./SidebarNav";

const meta: Meta<typeof SidebarNav> = {
  title: "Structure/SidebarNav",
  component: SidebarNav,
  args: { sections: navSections(), activeId: "notices" },
  decorators: [
    (Story) => (
      <div
        style={{
          display: "flex",
          height: "36rem",
          width: "var(--dp-layout-sidebar)",
          background: "var(--dp-material-chrome)",
          borderRadius: "var(--dp-radius-lg)",
        }}
      >
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SidebarNav>;

export const Default: Story = {
  args: { header: <Wordmark />, footer: <SidebarFooter /> },
};

export const NothingWaiting: Story = {
  args: { sections: navSections({ inbox: 0, overdue: 0 }), activeId: "today" },
};

export const Collapsed: Story = {
  args: { collapsed: true, header: <Wordmark /> },
  decorators: [
    (Story) => (
      <div style={{ width: "var(--dp-layout-sidebar-collapsed)" }}>
        <Story />
      </div>
    ),
  ],
};
