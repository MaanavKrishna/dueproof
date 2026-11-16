import { CopyIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row } from "../../stories/helpers";
import { Button } from "../Button/Button";
import { Tooltip } from "./Tooltip";

const meta = {
  title: "Overlays/Tooltip",
  component: Tooltip,
  args: { content: "Copy GSTIN", children: <Button icon={CopyIcon} aria-label="Copy GSTIN" /> },
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <div style={{ paddingBlock: "var(--dp-space-48)" }}>
      <Row gap={24}>
        <Tooltip content="Shown on hover and focus">
          <Button>Hover or focus</Button>
        </Tooltip>
        <Tooltip content="Search everything" shortcut="⌘K" side="bottom">
          <Button>With shortcut</Button>
        </Tooltip>
        <Tooltip content="Always open" defaultOpen side="right">
          <Button>Open</Button>
        </Tooltip>
      </Row>
    </div>
  ),
};
