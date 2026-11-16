import { ArrowLeftIcon, MoreIcon, UploadIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Breadcrumbs } from "../Breadcrumbs/Breadcrumbs";
import { Button } from "../Button/Button";
import { IconButton } from "../IconButton/IconButton";
import { Toolbar } from "./Toolbar";

const meta: Meta<typeof Toolbar> = {
  title: "Structure/Toolbar",
  component: Toolbar,
  parameters: { layout: "fullscreen" },
  args: {
    title: "Notices",
    subtitle: "142 open · 9 overdue",
    actions: (
      <>
        <IconButton icon={MoreIcon} label="More actions" />
        <Button variant="primary" icon={UploadIcon}>
          Upload notice
        </Button>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ height: "28rem", overflow: "auto", background: "var(--dp-bg-canvas)" }}>
        <Story />
        {Array.from({ length: 40 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static filler
          <p key={i} style={{ padding: "0 var(--dp-space-24)", color: "var(--dp-fg-secondary)" }}>
            Row {i + 1} — scroll: the large title slides under the bar and reappears small.
          </p>
        ))}
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof Toolbar>;

export const LargeTitle: Story = {};

export const WithBreadcrumbsAndBack: Story = {
  args: {
    title: "ZD2710260012345",
    subtitle: "GST · ASMT-10 · Harbour Valley Foods",
    leading: <IconButton icon={ArrowLeftIcon} label="Back to notices" />,
    breadcrumbs: (
      <Breadcrumbs
        items={[
          { id: "n", label: "Notices", href: "#" },
          { id: "c", label: "Harbour Valley Foods", href: "#" },
          { id: "r", label: "ZD2710260012345" },
        ]}
      />
    ),
  },
};

export const Compact: Story = { args: { largeTitle: false } };
