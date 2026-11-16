import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row } from "../../stories/helpers";
import { Spinner } from "./Spinner";

const meta = {
  title: "Feedback/Spinner",
  component: Spinner,
} satisfies Meta<typeof Spinner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  render: () => (
    <Row gap={24}>
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
      <span style={{ color: "var(--dp-accent-text)" }}>
        <Spinner label="Reading notice" />
      </span>
    </Row>
  ),
};
