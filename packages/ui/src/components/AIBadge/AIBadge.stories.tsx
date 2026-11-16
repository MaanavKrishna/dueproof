import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row, Section } from "../../stories/helpers";
import { AIBadge, OriginBadge } from "./AIBadge";

const meta = {
  title: "Dueproof/AIBadge",
  component: AIBadge,
  args: { state: "suggested" },
} satisfies Meta<typeof AIBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Suggested: Story = {};
export const Verified: Story = { args: { state: "verified", page: 2 } };

export const AllStates: Story = {
  render: () => (
    <>
      <Section title="AI badge">
        <Row>
          <AIBadge state="suggested" />
          <AIBadge state="verified" page={2} />
          <AIBadge state="suggested" size="sm" compact />
          <AIBadge state="verified" page={1} size="sm" compact />
        </Row>
      </Section>
      <Section title="Origin">
        <Row>
          <OriginBadge origin="rule" />
          <OriginBadge origin="ai" />
          <OriginBadge origin="rule+ai" />
          <OriginBadge origin="human" />
          <OriginBadge origin="rule" size="sm" />
        </Row>
      </Section>
    </>
  ),
};
