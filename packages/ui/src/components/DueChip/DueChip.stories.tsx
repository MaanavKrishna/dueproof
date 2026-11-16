import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, Row, Section, Stack } from "../../stories/helpers";
import { DueChip } from "./DueChip";

const meta = {
  title: "Status/DueChip",
  component: DueChip,
  args: { state: "today", detail: "16 Nov 2026" },
  argTypes: {
    state: { control: "inline-radio", options: ["overdue", "today", "week", "later", "done"] },
  },
} satisfies Meta<typeof DueChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Ladder: Story = {
  render: () => (
    <>
      <Section title="Word only">
        <Row>
          <DueChip state="overdue" />
          <DueChip state="today" />
          <DueChip state="week" />
          <DueChip state="later" />
          <DueChip state="done" />
        </Row>
      </Section>
      <Section title="With detail">
        <Row>
          <DueChip state="overdue" detail="3 days" />
          <DueChip state="today" detail="by 5 pm" />
          <DueChip state="week" detail="Fri 20 Nov" />
          <DueChip state="later" detail="12 Dec 2026" />
          <DueChip state="done" detail="Replied 10 Nov" />
        </Row>
      </Section>
      <Section title="Small, in a dense list">
        <Card>
          <Stack gap={8}>
            {(["overdue", "today", "week", "later", "done"] as const).map((s) => (
              <div
                key={s}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "var(--dp-space-16)",
                }}
              >
                <span>GST ASMT-10 · Arora Textiles</span>
                <DueChip state={s} size="sm" />
              </div>
            ))}
          </Stack>
        </Card>
      </Section>
    </>
  ),
};
