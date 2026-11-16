import { LockIcon } from "@dueproof/icons";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row } from "../../stories/helpers";
import { StatusPill } from "./StatusPill";

const meta = {
  title: "Status/StatusPill",
  component: StatusPill,
  args: { label: "In review", tone: "info" },
} satisfies Meta<typeof StatusPill>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <Row>
      <StatusPill label="New" tone="accent" />
      <StatusPill label="Reading" tone="info" live />
      <StatusPill label="In review" tone="warning" />
      <StatusPill label="Replied" tone="success" />
      <StatusPill label="Failed to read" tone="danger" />
      <StatusPill label="Closed" tone="neutral" />
      <StatusPill label="Locked" tone="neutral" icon={LockIcon} />
    </Row>
  ),
};
