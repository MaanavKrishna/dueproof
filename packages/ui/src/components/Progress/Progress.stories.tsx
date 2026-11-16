import type { Meta, StoryObj } from "@storybook/react-vite";
import { Row, Section, Stack } from "../../stories/helpers";
import { ProgressBar, ProgressRing, Stepper } from "./Progress";

const meta = {
  title: "Feedback/Progress",
  component: ProgressBar,
  args: { label: "Reading pages", value: 3, max: 5, valueText: "3 of 5 pages" },
} satisfies Meta<typeof ProgressBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllStates: Story = {
  render: () => (
    <>
      <Section title="Bar">
        <Stack width="420px">
          <ProgressBar label="Uploading" value={42} />
          <ProgressBar
            label="Reading pages"
            value={3}
            max={5}
            valueText="3 of 5 pages"
            tone="success"
          />
          <ProgressBar label="Translating" />
          <ProgressBar label="Failed" value={70} tone="danger" size="sm" />
        </Stack>
      </Section>
      <Section title="Ring">
        <Row gap={24}>
          <ProgressRing label="Verified" value={4} max={6} size="sm" />
          <ProgressRing label="Verified" value={4} max={6} showValue />
          <ProgressRing label="Verified" value={100} size="lg" tone="success" showValue />
        </Row>
      </Section>
      <Section title="Stepper">
        <Stack gap={32} width="720px">
          <Stepper
            label="Processing notice"
            steps={[
              { label: "Upload", status: "complete" },
              { label: "Read", status: "complete", detail: "5 pages" },
              { label: "Find dates", status: "current" },
              { label: "Check proof", status: "upcoming" },
            ]}
          />
          <Stepper
            label="Processing notice"
            orientation="vertical"
            steps={[
              { label: "Upload", status: "complete" },
              { label: "Read", status: "error", detail: "Page 3 is too dark to read." },
              { label: "Find dates", status: "upcoming" },
            ]}
          />
        </Stack>
      </Section>
    </>
  ),
};
